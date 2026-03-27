import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  status: string;
  active: boolean | null;
  vertical: string | null;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_started_at: string | null;
};

type SequenceStepRow = {
  sequence_id: string;
  cadence_key: string;
  cadence_name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  sequence_status: "draft" | "active" | "archived";
  sequence_step_id: string;
  step: number;
  channel: "email" | "linkedin" | "call_script" | "task";
  due_offset_days: number;
  required_contact_status: string | null;
  step_is_active: boolean;
  template_id: string | null;
  template_name: string | null;
  template_key: string | null;
  template_status: string | null;
  template_channel: "email" | "linkedin" | "call_script" | "task" | null;
  template_type: string | null;
  template_scope: string | null;
  subject: string | null;
  body: string | null;
  call_to_action: string | null;
};

type TaskRow = {
  id: string;
  completed_at: string | null;
  status: string | null;
  cadence_key: string | null;
  created_at: string | null;
};

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function normalizeVertical(v: string | null | undefined): "athletics" | "corporate" {
  return v === "corporate" ? "corporate" : "athletics";
}

function mapTaskType(
  channel: "email" | "linkedin" | "call_script" | "task"
): string {
  if (channel === "call_script") return "call";
  return channel;
}

export async function POST(req: Request) {
  try {
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
    const contact_id = String(body?.contact_id || "").trim();
    const cadence_key = String(body?.cadence_key || "").trim();
    const force_restart = Boolean(body?.force_restart);

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
      .maybeSingle<ContactRow>();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (!contact.active) {
      return NextResponse.json({ error: "Contact inactive" }, { status: 400 });
    }

    if (!isPrivileged(role) && contact.assigned_to_user_id !== me && contact.owner_user_id !== me) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (contact.status !== "New") {
      return NextResponse.json(
        { error: "Cadence can only start when contact status is New" },
        { status: 400 }
      );
    }

    const normalizedVertical = normalizeVertical(contact.vertical);

    const { data: step1, error: stepErr } = await supabaseAdmin
      .from("v_active_prospecting_sequence_steps")
      .select(`
        sequence_id,
        cadence_key,
        cadence_name,
        vertical,
        audience_stage,
        sequence_status,
        sequence_step_id,
        step,
        channel,
        due_offset_days,
        required_contact_status,
        step_is_active,
        template_id,
        template_name,
        template_key,
        template_status,
        template_channel,
        template_type,
        template_scope,
        subject,
        body,
        call_to_action
      `)
      .eq("cadence_key", cadence_key)
      .eq("step", 1)
      .eq("audience_stage", "new")
      .maybeSingle<SequenceStepRow>();

    if (stepErr) {
      return NextResponse.json({ error: stepErr.message }, { status: 500 });
    }

    if (!step1) {
      return NextResponse.json(
        { error: "Cadence step 1 not found in active prospecting sequences" },
        { status: 400 }
      );
    }

    if (step1.vertical !== normalizedVertical) {
      return NextResponse.json(
        {
          error: `Cadence ${cadence_key} is ${step1.vertical} and cannot be used for ${normalizedVertical} contacts.`,
        },
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
    const nowIso = now.toISOString();
    const due = addDays(now, Number(step1.due_offset_days || 0));
    const dueIso = due.toISOString();
    const taskType = mapTaskType(step1.channel);

    if (force_restart) {
      const { error: closeErr } = await supabaseAdmin
        .from("tasks")
        .update({
          completed_at: nowIso,
          status: "closed",
        })
        .eq("contact_id", contact_id)
        .eq("kind", "cadence")
        .is("completed_at", null);

      if (closeErr) {
        return NextResponse.json({ error: closeErr.message }, { status: 500 });
      }
    }

    const { error: contactUpErr } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_key,
        cadence_step: 1,
        cadence_status: "active",
        cadence_started_at: contact.cadence_started_at ?? nowIso,
        cadence_updated_at: nowIso,
        cadence_next_due_at: dueIso,
        updated_at: nowIso,
      })
      .eq("id", contact_id);

    if (contactUpErr) {
      return NextResponse.json({ error: contactUpErr.message }, { status: 500 });
    }

    const { data: stepScopedTasks, error: existingErr } = await supabaseAdmin
      .from("tasks")
      .select(`
        id,
        completed_at,
        status,
        cadence_key,
        created_at
      `)
      .eq("contact_id", contact_id)
      .eq("kind", "cadence")
      .eq("cadence_step", 1)
      .order("created_at", { ascending: false });

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    const existingTasks = (stepScopedTasks ?? []) as TaskRow[];
    const openTasks = existingTasks.filter((t) => !t.completed_at);
    const reusableTask = openTasks[0] ?? existingTasks[0] ?? null;

    if (openTasks.length > 1) {
      const duplicateIds = openTasks.slice(1).map((t) => t.id);

      if (duplicateIds.length > 0) {
        const { error: dupCloseErr } = await supabaseAdmin
          .from("tasks")
          .update({
            completed_at: nowIso,
            status: "closed",
          })
          .in("id", duplicateIds);

        if (dupCloseErr) {
          return NextResponse.json({ error: dupCloseErr.message }, { status: 500 });
        }
      }
    }

    if (reusableTask?.id) {
      const { error: reopenErr } = await supabaseAdmin
        .from("tasks")
        .update({
          assigned_to_user_id: contact.assigned_to_user_id || me,
          owner_user_id: contact.owner_user_id || me,
          task_type: taskType,
          due_at: dueIso,
          title: step1.subject,
          notes: step1.body,
          status: "open",
          completed_at: null,
          kind: "cadence",
          cadence_key,
          cadence_step: 1,
          updated_at: nowIso,
        })
        .eq("id", reusableTask.id);

      if (reopenErr) {
        return NextResponse.json({ error: reopenErr.message }, { status: 500 });
      }
    } else {
      const { error: taskErr } = await supabaseAdmin.from("tasks").insert({
        contact_id,
        assigned_to_user_id: contact.assigned_to_user_id || me,
        owner_user_id: contact.owner_user_id || me,
        task_type: taskType,
        due_at: dueIso,
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
      occurred_at: nowIso,
      subject: force_restart ? "Cadence restarted" : "Cadence started",
      body: `${force_restart ? "Restarted" : "Started"} cadence ${cadence_key} at step 1.`,
      outcome: force_restart ? "restart" : "start",
    });

    return NextResponse.json({
      ok: true,
      cadence_key,
      step: 1,
      due_at: dueIso,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}