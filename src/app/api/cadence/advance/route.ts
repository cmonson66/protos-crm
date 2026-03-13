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
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);
  if (!is_active) return NextResponse.json({ error: "User inactive" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const contact_id = String(body.contact_id || "").trim();

  if (!contact_id) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  // verify contact + assignment
  const { data: c, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id,assigned_to_user_id,cadence_key,cadence_step,cadence_status")
    .eq("id", contact_id)
    .maybeSingle();

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isPrivileged(role) && c.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!c.cadence_key || c.cadence_status !== "active") {
    return NextResponse.json({ error: "No active cadence on contact" }, { status: 400 });
  }

  const nextStep = (c.cadence_step || 0) + 1;

  const { data: step, error: sErr } = await supabaseAdmin
    .from("cadence_steps")
    .select("step_number,delay_days,subject,body,is_active")
    .eq("cadence_key", c.cadence_key)
    .eq("step_number", nextStep)
    .eq("is_active", true)
    .maybeSingle();

  // if no next step: finish cadence
  if (!step) {
    const now = new Date();
    const { error: finErr } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_status: "complete",
        cadence_next_due_at: null,
        cadence_updated_at: now.toISOString(),
      })
      .eq("id", contact_id);

    if (finErr) return NextResponse.json({ error: finErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, finished: true });
  }

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const now = new Date();
  const due = addDays(now, step.delay_days);

  // update contact
  const { error: upErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_step: nextStep,
      cadence_status: "active",
      cadence_updated_at: now.toISOString(),
      cadence_next_due_at: due.toISOString(),
    })
    .eq("id", contact_id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // create next task
  const { error: taskErr } = await supabaseAdmin.from("tasks").insert({
    contact_id,
    assigned_to_user_id: c.assigned_to_user_id ?? me,
    owner_user_id: c.assigned_to_user_id ?? me,
    task_type: "follow_up",
    due_at: due.toISOString(),
    title: step.subject,
    notes: step.body,
    status: "open",
    kind: "cadence",
    cadence_key: c.cadence_key,
    cadence_step: nextStep,
  });

  if (taskErr && !taskErr.message.toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, finished: false, step: nextStep });
}