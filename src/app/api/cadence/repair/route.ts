import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  status: string;
  active: boolean | null;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_next_due_at: string | null;
  cadence_started_at?: string | null;
  cadence_updated_at?: string | null;
};

type TaskRow = {
  id: string;
  contact_id: string;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  task_type: string | null;
  due_at: string | null;
  title: string | null;
  notes: string | null;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  completed_at: string | null;
  created_at?: string | null;
};

type SequenceStepRow = {
  sequence_id: string;
  cadence_key: string;
  cadence_name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  sequence_status: string;
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
  template_channel: string | null;
  template_type: string | null;
  template_scope: string | null;
  subject: string | null;
  body: string | null;
  call_to_action: string | null;
};

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function taskTypeFromChannel(channel: SequenceStepRow["channel"]) {
  if (channel === "email") return "email";
  if (channel === "linkedin") return "linkedin";
  if (channel === "call_script") return "call_script";
  return "task";
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
  const contact_id = String(body?.contact_id || "").trim();

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      status,
      active,
      assigned_to_user_id,
      owner_user_id,
      cadence_key,
      cadence_step,
      cadence_status,
      cadence_next_due_at,
      cadence_started_at,
      cadence_updated_at
    `)
    .eq("id", contact_id)
    .maybeSingle<ContactRow>();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!isPrivileged(role) && contact.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (contact.active === false) {
    return NextResponse.json({ error: "Contact inactive" }, { status: 400 });
  }

  if (!contact.cadence_key || Number(contact.cadence_step || 0) < 1) {
    return NextResponse.json(
      { error: "Contact does not have an active or repairable cadence state" },
      { status: 400 }
    );
  }

  const cadence_key = String(contact.cadence_key);
  const cadence_step = Number(contact.cadence_step || 0);

  const { data: sequenceStep, error: templateErr } = await supabaseAdmin
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
    .eq("step", cadence_step)
    .maybeSingle<SequenceStepRow>();

  if (templateErr) {
    return NextResponse.json({ error: templateErr.message }, { status: 500 });
  }

  if (!sequenceStep) {
    return NextResponse.json(
      { error: `No active sequence step found for cadence_key=${cadence_key} step=${cadence_step}` },
      { status: 400 }
    );
  }

  if (
    sequenceStep.required_contact_status &&
    String(sequenceStep.required_contact_status) !== String(contact.status || "")
  ) {
    const { error: stopErr } = await supabaseAdmin.rpc("cadence_stop", {
      p_contact_id: contact_id,
      p_actor_user_id: me,
      p_reason: `repair_blocked_status_${contact.status}`,
    });

    if (stopErr) {
      return NextResponse.json({ error: stopErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      repaired: false,
      action: "stopped",
      reason: `Cadence stopped because contact status is ${contact.status}`,
    });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const dueAt =
    contact.cadence_next_due_at ||
    addDays(now, Number(sequenceStep.due_offset_days || 0)).toISOString();

  const desiredTaskType = taskTypeFromChannel(sequenceStep.channel);
  const desiredTitle =
    sequenceStep.subject ||
    sequenceStep.template_name ||
    `${sequenceStep.cadence_name} Step ${sequenceStep.step}`;
  const desiredNotes = sequenceStep.body || "";

  const { data: stepScopedTasks, error: stepScopedTasksErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      contact_id,
      assigned_to_user_id,
      owner_user_id,
      task_type,
      due_at,
      title,
      notes,
      status,
      kind,
      cadence_key,
      cadence_step,
      completed_at,
      created_at
    `)
    .eq("contact_id", contact_id)
    .eq("kind", "cadence")
    .eq("cadence_step", cadence_step)
    .order("created_at", { ascending: false });

  if (stepScopedTasksErr) {
    return NextResponse.json({ error: stepScopedTasksErr.message }, { status: 500 });
  }

  const tasks = (stepScopedTasks ?? []) as TaskRow[];
  const openTasks = tasks.filter((t) => !t.completed_at);

  let repairedTaskId: string | null = null;
  const actions: string[] = [];

  if (openTasks.length > 1) {
    const keep = openTasks[0];
    repairedTaskId = keep.id;

    const duplicateIds = openTasks.slice(1).map((t) => t.id);
    if (duplicateIds.length > 0) {
      const { error: dupCloseErr } = await supabaseAdmin
        .from("tasks")
        .update({
          completed_at: nowIso,
          status: "closed",
          updated_at: nowIso,
        })
        .in("id", duplicateIds);

      if (dupCloseErr) {
        return NextResponse.json({ error: dupCloseErr.message }, { status: 500 });
      }

      actions.push(`Closed ${duplicateIds.length} duplicate open cadence task(s)`);
    }

    const { error: normalizeKeepErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || me,
        owner_user_id: contact.owner_user_id || me,
        task_type: desiredTaskType,
        due_at: dueAt,
        title: desiredTitle,
        notes: desiredNotes,
        status: "open",
        completed_at: null,
        cadence_key,
        cadence_step,
        updated_at: nowIso,
      })
      .eq("id", keep.id);

    if (normalizeKeepErr) {
      return NextResponse.json({ error: normalizeKeepErr.message }, { status: 500 });
    }

    actions.push("Normalized surviving open cadence task to current cadence state");
  } else if (openTasks.length === 1) {
    const existing = openTasks[0];
    repairedTaskId = existing.id;

    const { error: normalizeErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || me,
        owner_user_id: contact.owner_user_id || me,
        task_type: desiredTaskType,
        due_at: dueAt,
        title: desiredTitle,
        notes: desiredNotes,
        status: "open",
        completed_at: null,
        cadence_key,
        cadence_step,
        updated_at: nowIso,
      })
      .eq("id", existing.id);

    if (normalizeErr) {
      return NextResponse.json({ error: normalizeErr.message }, { status: 500 });
    }

    actions.push("Normalized existing open cadence task");
  } else {
    const reusableClosed = tasks[0] ?? null;

    if (reusableClosed?.id) {
      repairedTaskId = reusableClosed.id;

      const { error: reviveErr } = await supabaseAdmin
        .from("tasks")
        .update({
          assigned_to_user_id: contact.assigned_to_user_id || me,
          owner_user_id: contact.owner_user_id || me,
          task_type: desiredTaskType,
          due_at: dueAt,
          title: desiredTitle,
          notes: desiredNotes,
          status: "open",
          completed_at: null,
          cadence_key,
          cadence_step,
          updated_at: nowIso,
        })
        .eq("id", reusableClosed.id);

      if (reviveErr) {
        return NextResponse.json({ error: reviveErr.message }, { status: 500 });
      }

      actions.push("Reopened existing cadence step task");
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("tasks")
        .insert({
          contact_id,
          assigned_to_user_id: contact.assigned_to_user_id || me,
          owner_user_id: contact.owner_user_id || me,
          task_type: desiredTaskType,
          due_at: dueAt,
          title: desiredTitle,
          notes: desiredNotes,
          status: "open",
          kind: "cadence",
          cadence_key,
          cadence_step,
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      repairedTaskId = inserted.id;
      actions.push("Created missing cadence task");
    }
  }

  const { error: contactFixErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_key,
      cadence_step,
      cadence_status: "active",
      cadence_next_due_at: dueAt,
      cadence_started_at: contact.cadence_started_at ?? nowIso,
      cadence_updated_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", contact_id);

  if (contactFixErr) {
    return NextResponse.json({ error: contactFixErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("activities").insert({
    contact_id,
    user_id: me,
    type: "cadence",
    occurred_at: nowIso,
    subject: "Cadence repaired",
    body: [
      `Cadence ${cadence_key} repaired at step ${cadence_step}.`,
      `Step channel: ${sequenceStep.channel}.`,
      ...actions,
    ].join("\n"),
    outcome: "repair",
  });

  return NextResponse.json({
    ok: true,
    repaired: true,
    contact_id,
    cadence_key,
    cadence_step,
    task_id: repairedTaskId,
    due_at: dueAt,
    channel: sequenceStep.channel,
    actions,
  });
}