import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CadenceSignal =
  | "touch"
  | "call"
  | "email"
  | "note"
  | "meeting"
  | "reply";

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
};

type GuardedTaskRow = {
  id: string;
  contact_id: string;
  cadence_key: string | null;
  cadence_step: number | null;
  completed_at: string | null;
  status: string | null;
  created_at?: string | null;
  assigned_to_user_id?: string | null;
  owner_user_id?: string | null;
  task_type?: string | null;
  due_at?: string | null;
  title?: string | null;
  notes?: string | null;
};

type AutoAdvanceResult =
  | {
      ok: true;
      action: "advanced";
      contact_id: string;
      cadence_key: string;
      previous_step: number;
      next_step: number | null;
      cadence_status: string | null;
      cadence_next_due_at: string | null;
      task_id: string;
    }
  | {
      ok: true;
      action: "stopped";
      contact_id: string;
      cadence_key: string | null;
      reason: string;
    }
  | {
      ok: true;
      action: "noop";
      contact_id: string;
      reason: string;
      guard?: string;
    }
  | {
      ok: false;
      error: string;
      guard?: string;
    };

function signalLabel(signal: CadenceSignal) {
  switch (signal) {
    case "touch":
      return "Touch logged";
    case "call":
      return "Call logged";
    case "email":
      return "Email logged";
    case "note":
      return "Note logged";
    case "meeting":
      return "Meeting logged";
    case "reply":
      return "Reply detected";
    default:
      return "Cadence signal";
  }
}

async function loadContact(contactId: string) {
  const { data, error } = await supabaseAdmin
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
      cadence_next_due_at
    `)
    .eq("id", contactId)
    .maybeSingle<ContactRow>();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data ?? null, error: null };
}

async function loadStepScopedCadenceTasks(contact: ContactRow) {
  const cadenceStep = Number(contact.cadence_step || 0);

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      contact_id,
      cadence_key,
      cadence_step,
      completed_at,
      status,
      created_at,
      assigned_to_user_id,
      owner_user_id,
      task_type,
      due_at,
      title,
      notes
    `)
    .eq("contact_id", contact.id)
    .eq("kind", "cadence")
    .eq("cadence_step", cadenceStep)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data ?? []) as GuardedTaskRow[], error: null };
}

async function loadCurrentTemplateStep(contact: ContactRow) {
  const cadenceKey = String(contact.cadence_key || "").trim();
  const cadenceStep = Number(contact.cadence_step || 0);

  const { data, error } = await supabaseAdmin
    .from("cadence_template_steps")
    .select(`
      cadence_key,
      step,
      subject,
      body,
      due_offset_days,
      required_contact_status,
      is_active
    `)
    .eq("cadence_key", cadenceKey)
    .eq("step", cadenceStep)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return { ok: false as const, error: error.message, data: null };
  }

  if (!data) {
    return {
      ok: false as const,
      error: `Missing active cadence template step for ${cadenceKey} step ${cadenceStep}`,
      data: null,
    };
  }

  if (
    data.required_contact_status &&
    String(data.required_contact_status) !== String(contact.status || "")
  ) {
    return {
      ok: false as const,
      error: `Current cadence step requires contact status ${data.required_contact_status}`,
      data: null,
    };
  }

  return { ok: true as const, error: null, data };
}

async function recentAutopilotAlreadyRan(args: {
  contactId: string;
  actorUserId: string;
  signal: CadenceSignal;
}) {
  const sinceIso = new Date(Date.now() - 15000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("activities")
    .select(`
      id,
      subject,
      body,
      occurred_at,
      outcome
    `)
    .eq("contact_id", args.contactId)
    .eq("user_id", args.actorUserId)
    .eq("type", "cadence")
    .eq("outcome", "auto_advanced")
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { blocked: false, error: error.message };
  }

  if (!data) {
    return { blocked: false, error: null };
  }

  const body = String(data.body || "").toLowerCase();
  const signalText = signalLabel(args.signal).toLowerCase();

  if (body.includes(signalText.toLowerCase())) {
    return { blocked: true, error: null };
  }

  return { blocked: false, error: null };
}

async function stopCadence(contactId: string, actorUserId: string, reason: string) {
  const { error } = await supabaseAdmin.rpc("cadence_stop", {
    p_contact_id: contactId,
    p_actor_user_id: actorUserId,
    p_reason: reason,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

async function normalizeCurrentStepTask(args: {
  contact: ContactRow;
  actorUserId: string;
}) {
  const { contact, actorUserId } = args;

  const templateCheck = await loadCurrentTemplateStep(contact);
  if (!templateCheck.ok || !templateCheck.data) {
    return {
      ok: false as const,
      error: templateCheck.error,
      guard: "missing_or_invalid_template_step",
      task: null,
    };
  }

  const currentTemplate = templateCheck.data;
  const nowIso = new Date().toISOString();
  const dueAt =
    contact.cadence_next_due_at ||
    addDays(new Date(), Number(currentTemplate.due_offset_days || 0)).toISOString();

  const stepTasksResult = await loadStepScopedCadenceTasks(contact);
  if (stepTasksResult.error) {
    return {
      ok: false as const,
      error: stepTasksResult.error,
      guard: "open_task_lookup_failed",
      task: null,
    };
  }

  const stepTasks = stepTasksResult.data ?? [];
  const openTasks = stepTasks.filter((t) => !t.completed_at);

  let chosenTask: GuardedTaskRow | null = null;

  if (openTasks.length > 1) {
    chosenTask = openTasks[0];
    const duplicateIds = openTasks.slice(1).map((t) => t.id);

    if (duplicateIds.length > 0) {
      const { error: closeDupErr } = await supabaseAdmin
        .from("tasks")
        .update({
          status: "closed",
          completed_at: nowIso,
        })
        .in("id", duplicateIds);

      if (closeDupErr) {
        return {
          ok: false as const,
          error: closeDupErr.message,
          guard: "close_duplicate_tasks_failed",
          task: null,
        };
      }
    }

    const { error: normalizeErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || actorUserId,
        owner_user_id: contact.owner_user_id || actorUserId,
        task_type: "email",
        due_at: dueAt,
        title: currentTemplate.subject,
        notes: currentTemplate.body,
        status: "open",
        completed_at: null,
        cadence_key: contact.cadence_key,
        cadence_step: contact.cadence_step,
      })
      .eq("id", chosenTask.id);

    if (normalizeErr) {
      return {
        ok: false as const,
        error: normalizeErr.message,
        guard: "normalize_surviving_task_failed",
        task: null,
      };
    }

    return { ok: true as const, error: null, guard: null, task: chosenTask };
  }

  if (openTasks.length === 1) {
    chosenTask = openTasks[0];

    const { error: normalizeErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || actorUserId,
        owner_user_id: contact.owner_user_id || actorUserId,
        task_type: "email",
        due_at: dueAt,
        title: currentTemplate.subject,
        notes: currentTemplate.body,
        status: "open",
        completed_at: null,
        cadence_key: contact.cadence_key,
        cadence_step: contact.cadence_step,
      })
      .eq("id", chosenTask.id);

    if (normalizeErr) {
      return {
        ok: false as const,
        error: normalizeErr.message,
        guard: "normalize_existing_task_failed",
        task: null,
      };
    }

    return { ok: true as const, error: null, guard: null, task: chosenTask };
  }

  const reusableTask = stepTasks[0] ?? null;

  if (reusableTask?.id) {
    chosenTask = reusableTask;

    const { error: reopenErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || actorUserId,
        owner_user_id: contact.owner_user_id || actorUserId,
        task_type: "email",
        due_at: dueAt,
        title: currentTemplate.subject,
        notes: currentTemplate.body,
        status: "open",
        completed_at: null,
        cadence_key: contact.cadence_key,
        cadence_step: contact.cadence_step,
      })
      .eq("id", reusableTask.id);

    if (reopenErr) {
      return {
        ok: false as const,
        error: reopenErr.message,
        guard: "reopen_existing_task_failed",
        task: null,
      };
    }

    return { ok: true as const, error: null, guard: null, task: reusableTask };
  }

  return {
    ok: true as const,
    error: null,
    guard: "missing_open_cadence_task",
    task: null,
  };
}

export async function runCadenceAutopilot(args: {
  contactId: string;
  actorUserId: string;
  signal: CadenceSignal;
  note?: string | null;
}): Promise<AutoAdvanceResult> {
  const { contactId, actorUserId, signal, note } = args;

  const loaded = await loadContact(contactId);
  if (loaded.error) {
    return { ok: false, error: loaded.error, guard: "load_contact_failed" };
  }

  const contact = loaded.data;
  if (!contact) {
    return { ok: false, error: "Contact not found", guard: "contact_missing" };
  }

  if (contact.active === false) {
    return {
      ok: true,
      action: "noop",
      contact_id: contactId,
      reason: "Contact inactive",
      guard: "inactive_contact",
    };
  }

  if (!contact.cadence_key || contact.cadence_status !== "active" || Number(contact.cadence_step || 0) < 1) {
    return {
      ok: true,
      action: "noop",
      contact_id: contactId,
      reason: "No active cadence to process",
      guard: "no_active_cadence",
    };
  }

  if (signal === "reply") {
    const stop = await stopCadence(contactId, actorUserId, "reply_detected");
    if (!stop.ok) {
      return { ok: false, error: stop.error, guard: "reply_stop_failed" };
    }

    await supabaseAdmin.from("activities").insert({
      contact_id: contactId,
      user_id: actorUserId,
      type: "cadence",
      occurred_at: new Date().toISOString(),
      subject: "Cadence auto-stopped",
      body: [
        `${signalLabel(signal)} triggered autonomous cadence stop.`,
        note ? `Note: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      outcome: "reply_detected",
    });

    return {
      ok: true,
      action: "stopped",
      contact_id: contactId,
      cadence_key: contact.cadence_key,
      reason: "Reply detected",
    };
  }

  const templateCheck = await loadCurrentTemplateStep(contact);
  if (!templateCheck.ok) {
    return {
      ok: true,
      action: "noop",
      contact_id: contactId,
      reason: templateCheck.error || "Invalid cadence template step",
      guard: "missing_or_invalid_template_step",
    };
  }

  const recentCheck = await recentAutopilotAlreadyRan({
    contactId,
    actorUserId,
    signal,
  });

  if (recentCheck.error) {
    return {
      ok: false,
      error: recentCheck.error,
      guard: "recent_guard_check_failed",
    };
  }

  if (recentCheck.blocked) {
    return {
      ok: true,
      action: "noop",
      contact_id: contactId,
      reason: "Recent auto-advance already processed for this contact/signal",
      guard: "recent_duplicate_signal",
    };
  }

  const normalized = await normalizeCurrentStepTask({
    contact,
    actorUserId,
  });

  if (!normalized.ok) {
    return {
      ok: false,
      error: normalized.error,
      guard: normalized.guard || "normalize_current_step_task_failed",
    };
  }

  if (!normalized.task) {
    return {
      ok: true,
      action: "noop",
      contact_id: contactId,
      reason: "No cadence step task exists for current step",
      guard: normalized.guard || "missing_open_cadence_task",
    };
  }

  const task = normalized.task;
  const previousStep = Number(contact.cadence_step || 0);
  const nowIso = new Date().toISOString();

  const { error: closeErr } = await supabaseAdmin
    .from("tasks")
    .update({
      completed_at: nowIso,
      status: "closed",
    })
    .eq("id", task.id)
    .is("completed_at", null);

  if (closeErr) {
    return { ok: false, error: closeErr.message, guard: "close_task_failed" };
  }

  const { error: advErr } = await supabaseAdmin.rpc("cadence_advance_from_task", {
    p_task_id: task.id,
  });

  if (advErr) {
    return { ok: false, error: advErr.message, guard: "advance_rpc_failed" };
  }

  const { data: updatedContact, error: updatedErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      cadence_key,
      cadence_step,
      cadence_status,
      cadence_next_due_at
    `)
    .eq("id", contactId)
    .maybeSingle();

  if (updatedErr) {
    return { ok: false, error: updatedErr.message, guard: "reload_contact_failed" };
  }

  const nextStep = updatedContact?.cadence_step ? Number(updatedContact.cadence_step) : null;
  const nextStatus = updatedContact?.cadence_status ?? null;

  const advancedProperly =
    (nextStep !== null && nextStep > previousStep) ||
    nextStatus === "completed" ||
    nextStatus === "stopped";

  if (!advancedProperly) {
    return {
      ok: false,
      error: "Cadence advance completed but contact state did not move forward",
      guard: "post_advance_state_mismatch",
    };
  }

  await supabaseAdmin.from("activities").insert({
    contact_id: contactId,
    user_id: actorUserId,
    type: "cadence",
    occurred_at: nowIso,
    subject: "Cadence auto-advanced",
    body: [
      `${signalLabel(signal)} triggered autonomous cadence advancement.`,
      `Previous step: ${previousStep}`,
      nextStep ? `New step: ${nextStep}` : "",
      note ? `Note: ${note}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    outcome: "auto_advanced",
  });

  return {
    ok: true,
    action: "advanced",
    contact_id: contactId,
    cadence_key: String(updatedContact?.cadence_key || contact.cadence_key || ""),
    previous_step: previousStep,
    next_step: nextStep,
    cadence_status: nextStatus,
    cadence_next_due_at: updatedContact?.cadence_next_due_at ?? null,
    task_id: task.id,
  };
}