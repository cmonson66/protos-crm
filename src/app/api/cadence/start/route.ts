import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const contact_id = String(body.contact_id || "").trim();
  const cadence_key = String(body.cadence_key || "").trim();
  const force_restart = Boolean(body.force_restart);

  if (!contact_id || !cadence_key) {
    return NextResponse.json(
      { error: "contact_id and cadence_key required" },
      { status: 400 }
    );
  }

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      status,
      active,
      vertical,
      assigned_to_user_id,
      owner_user_id,
      cadence_key,
      cadence_step,
      cadence_status,
      cadence_started_at
    `)
    .eq("id", contact_id)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.active) {
    return NextResponse.json({ error: "Contact inactive" }, { status: 400 });
  }

  if (!isPrivileged(role) && contact.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (contact.status !== "New") {
    return NextResponse.json(
      { error: "Cadence can only start when contact status is New" },
      { status: 400 }
    );
  }

  const { data: cadenceTemplate, error: templateErr } = await supabaseAdmin
    .from("cadence_templates")
    .select("key, vertical, is_active")
    .eq("key", cadence_key)
    .eq("is_active", true)
    .maybeSingle();

  if (templateErr) {
    return NextResponse.json({ error: templateErr.message }, { status: 500 });
  }

  if (!cadenceTemplate) {
    return NextResponse.json({ error: "Cadence not found" }, { status: 400 });
  }

  if (cadenceTemplate.vertical !== contact.vertical) {
    return NextResponse.json(
      { error: `Cadence ${cadence_key} is ${cadenceTemplate.vertical} and cannot be used for ${contact.vertical} contacts.` },
      { status: 400 }
    );
  }

  const { data: step1, error: stepErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .select(`
      cadence_key,
      step,
      name,
      subject,
      body,
      due_offset_days,
      required_contact_status,
      is_active,
      vertical
    `)
    .eq("cadence_key", cadence_key)
    .eq("step", 1)
    .eq("is_active", true)
    .maybeSingle();

  if (stepErr) {
    return NextResponse.json({ error: stepErr.message }, { status: 500 });
  }

  if (!step1) {
    return NextResponse.json(
      { error: "Cadence step 1 not found" },
      { status: 400 }
    );
  }

  if (
    step1.required_contact_status &&
    step1.required_contact_status !== contact.status
  ) {
    return NextResponse.json(
      {
        error: `Cadence step 1 requires contact status ${step1.required_contact_status}`,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const due = addDays(now, Number(step1.due_offset_days || 0));

  if (force_restart) {
    const { error: cleanupErr } = await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("contact_id", contact_id)
      .eq("kind", "cadence")
      .eq("cadence_key", cadence_key);

    if (cleanupErr) {
      return NextResponse.json({ error: cleanupErr.message }, { status: 500 });
    }
  }

  const { error: upErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_key,
      cadence_step: 1,
      cadence_status: "active",
      cadence_started_at: contact.cadence_started_at ?? now.toISOString(),
      cadence_updated_at: now.toISOString(),
      cadence_next_due_at: due.toISOString(),
    })
    .eq("id", contact_id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: existingTask, error: existingErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      completed_at,
      status
    `)
    .eq("contact_id", contact_id)
    .eq("kind", "cadence")
    .eq("cadence_key", cadence_key)
    .eq("cadence_step", 1)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existingTask?.id) {
    const { error: reopenErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || me,
        owner_user_id: contact.owner_user_id || me,
        task_type: "email",
        due_at: due.toISOString(),
        title: step1.subject,
        notes: step1.body,
        status: "open",
        completed_at: null,
      })
      .eq("id", existingTask.id);

    if (reopenErr) {
      return NextResponse.json({ error: reopenErr.message }, { status: 500 });
    }
  } else {
    const { error: taskErr } = await supabaseAdmin.from("tasks").insert({
      contact_id,
      assigned_to_user_id: contact.assigned_to_user_id || me,
      owner_user_id: contact.owner_user_id || me,
      task_type: "email",
      due_at: due.toISOString(),
      title: step1.subject,
      notes: step1.body,
      status: "open",
      kind: "cadence",
      cadence_key,
      cadence_step: 1,
    });

    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 500 });
    }
  }

  await supabaseAdmin.from("activities").insert({
    contact_id,
    user_id: me,
    type: "cadence",
    occurred_at: now.toISOString(),
    subject: "Cadence started",
    body: `Cadence ${cadence_key} started at step 1.`,
  });

  return NextResponse.json({ ok: true });
}