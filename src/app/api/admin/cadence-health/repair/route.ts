import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  status: string | null;
  active: boolean | null;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_next_due_at: string | null;
};

type TemplateStepRow = {
  cadence_key: string;
  step: number;
  subject: string | null;
  body: string | null;
  due_offset_days: number | null;
  required_contact_status: string | null;
  is_active: boolean | null;
};

type TaskRow = {
  id: string;
  contact_id: string;
  cadence_key: string | null;
  cadence_step: number | null;
  due_at: string | null;
  created_at: string | null;
  completed_at: string | null;
  status: string | null;
};

type RepairResult =
  | { ok: true; message: string; would_change?: boolean }
  | { ok: false; error: string; would_change?: boolean };

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
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

  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
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
    .maybeSingle<TemplateStepRow>();

  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}

async function loadOpenCadenceTasks(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      contact_id,
      cadence_key,
      cadence_step,
      due_at,
      created_at,
      completed_at,
      status
    `)
    .eq("contact_id", contactId)
    .eq("kind", "cadence")
    .is("completed_at", null)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TaskRow[], error: null };
}

async function createCurrentStepTask(contact: ContactRow, template: TemplateStepRow) {
  const now = new Date();
  const due = addDays(now, Number(template.due_offset_days || 0));

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert({
      contact_id: contact.id,
      assigned_to_user_id: contact.assigned_to_user_id,
      owner_user_id: contact.owner_user_id,
      task_type: "email",
      due_at: due.toISOString(),
      title: template.subject || `Cadence step ${template.step}`,
      notes: template.body || "",
      status: "open",
      kind: "cadence",
      cadence_key: contact.cadence_key,
      cadence_step: Number(contact.cadence_step || 0),
    })
    .select("id, due_at")
    .maybeSingle();

  if (error) return { data: null, error: error.message };

  const { error: contactErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_next_due_at: due.toISOString(),
      cadence_updated_at: now.toISOString(),
    })
    .eq("id", contact.id);

  if (contactErr) return { data: null, error: contactErr.message };

  return { data: data ?? null, error: null };
}

async function repairRecreateCurrentTask(contact: ContactRow, dryRun: boolean): Promise<RepairResult> {
  if (contact.active === false) {
    return { ok: false, error: "Contact inactive" };
  }

  if (
    !contact.cadence_key ||
    contact.cadence_status !== "active" ||
    Number(contact.cadence_step || 0) < 1
  ) {
    return { ok: false, error: "Contact does not have an active cadence state" };
  }

  const templateResult = await loadCurrentTemplateStep(contact);
  if (templateResult.error) return { ok: false, error: templateResult.error };
  if (!templateResult.data) {
    return { ok: false, error: "Missing active template step for current cadence state" };
  }

  if (
    templateResult.data.required_contact_status &&
    String(templateResult.data.required_contact_status) !== String(contact.status || "")
  ) {
    return {
      ok: false,
      error: `Current step requires contact status ${templateResult.data.required_contact_status}`,
    };
  }

  const tasksResult = await loadOpenCadenceTasks(contact.id);
  if (tasksResult.error) return { ok: false, error: tasksResult.error };

  const currentTasks = tasksResult.data.filter(
    (t) =>
      String(t.cadence_key || "") === String(contact.cadence_key || "") &&
      Number(t.cadence_step || 0) === Number(contact.cadence_step || 0)
  );

  if (currentTasks.length > 0) {
    return { ok: true, message: "Open current-step cadence task already exists", would_change: false };
  }

  if (dryRun) {
    return { ok: true, message: "Would recreate current-step cadence task", would_change: true };
  }

  const created = await createCurrentStepTask(contact, templateResult.data);
  if (created.error) return { ok: false, error: created.error };

  return { ok: true, message: "Current-step cadence task recreated", would_change: true };
}

async function repairDedupeTasks(contact: ContactRow, dryRun: boolean): Promise<RepairResult> {
  const tasksResult = await loadOpenCadenceTasks(contact.id);
  if (tasksResult.error) return { ok: false, error: tasksResult.error };

  const currentTasks = tasksResult.data.filter(
    (t) =>
      String(t.cadence_key || "") === String(contact.cadence_key || "") &&
      Number(t.cadence_step || 0) === Number(contact.cadence_step || 0)
  );

  if (currentTasks.length <= 1) {
    return { ok: true, message: "No duplicate current-step tasks found", would_change: false };
  }

  const [keep, ...closeThese] = currentTasks;
  const closeIds = closeThese.map((t) => t.id);

  if (dryRun) {
    return {
      ok: true,
      message: `Would keep newest task ${keep.id} and close ${closeIds.length} duplicate task(s)`,
      would_change: true,
    };
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("tasks")
    .update({
      completed_at: nowIso,
      status: "closed",
    })
    .in("id", closeIds)
    .is("completed_at", null);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: `Kept newest task ${keep.id} and closed ${closeIds.length} duplicate task(s)`,
    would_change: true,
  };
}

async function repairStopCadence(contact: ContactRow, actorUserId: string, dryRun: boolean): Promise<RepairResult> {
  if (dryRun) {
    return { ok: true, message: "Would stop cadence safely", would_change: true };
  }

  const { error } = await supabaseAdmin.rpc("cadence_stop", {
    p_contact_id: contact.id,
    p_actor_user_id: actorUserId,
    p_reason: "admin_repair_stop",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Cadence stopped safely", would_change: true };
}

async function repairRecalculateDueDate(contact: ContactRow, dryRun: boolean): Promise<RepairResult> {
  const templateResult = await loadCurrentTemplateStep(contact);
  if (templateResult.error) return { ok: false, error: templateResult.error };
  if (!templateResult.data) {
    return { ok: false, error: "Missing active template step for current cadence state" };
  }

  const due = addDays(new Date(), Number(templateResult.data.due_offset_days || 0)).toISOString();

  if (dryRun) {
    return {
      ok: true,
      message: `Would recalculate cadence next due date to ${due}`,
      would_change: true,
    };
  }

  const { error: contactErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_next_due_at: due,
      cadence_updated_at: new Date().toISOString(),
    })
    .eq("id", contact.id);

  if (contactErr) return { ok: false, error: contactErr.message };

  const tasksResult = await loadOpenCadenceTasks(contact.id);
  if (tasksResult.error) return { ok: false, error: tasksResult.error };

  const currentTaskIds = tasksResult.data
    .filter(
      (t) =>
        String(t.cadence_key || "") === String(contact.cadence_key || "") &&
        Number(t.cadence_step || 0) === Number(contact.cadence_step || 0)
    )
    .map((t) => t.id);

  if (currentTaskIds.length > 0) {
    const { error: taskErr } = await supabaseAdmin
      .from("tasks")
      .update({ due_at: due })
      .in("id", currentTaskIds)
      .is("completed_at", null);

    if (taskErr) return { ok: false, error: taskErr.message };
  }

  return { ok: true, message: "Cadence next due date recalculated", would_change: true };
}

async function repairResyncTasks(contact: ContactRow, dryRun: boolean): Promise<RepairResult> {
  const tasksResult = await loadOpenCadenceTasks(contact.id);
  if (tasksResult.error) return { ok: false, error: tasksResult.error };

  const correctTasks = tasksResult.data.filter(
    (t) =>
      String(t.cadence_key || "") === String(contact.cadence_key || "") &&
      Number(t.cadence_step || 0) === Number(contact.cadence_step || 0)
  );

  const mismatchedTasks = tasksResult.data.filter(
    (t) =>
      String(t.cadence_key || "") !== String(contact.cadence_key || "") ||
      Number(t.cadence_step || 0) !== Number(contact.cadence_step || 0)
  );

  if (mismatchedTasks.length === 0 && correctTasks.length === 1) {
    return { ok: true, message: "Task state already healthy", would_change: false };
  }

  if (dryRun) {
    if (correctTasks.length === 0) {
      return {
        ok: true,
        message: `Would close ${mismatchedTasks.length} mismatched task(s) and recreate current-step task`,
        would_change: true,
      };
    }
    if (correctTasks.length > 1) {
      return {
        ok: true,
        message: `Would close ${mismatchedTasks.length} mismatched task(s) and dedupe current-step tasks`,
        would_change: true,
      };
    }
    return {
      ok: true,
      message: `Would close ${mismatchedTasks.length} mismatched task(s)`,
      would_change: true,
    };
  }

  if (mismatchedTasks.length > 0) {
    const { error: closeErr } = await supabaseAdmin
      .from("tasks")
      .update({
        completed_at: new Date().toISOString(),
        status: "closed",
      })
      .in(
        "id",
        mismatchedTasks.map((t) => t.id)
      )
      .is("completed_at", null);

    if (closeErr) return { ok: false, error: closeErr.message };
  }

  if (correctTasks.length === 0) {
    const recreated = await repairRecreateCurrentTask(contact, false);
    if (!recreated.ok) return recreated;
    return {
      ok: true,
      message: `Closed ${mismatchedTasks.length} mismatched task(s) and recreated current-step task`,
      would_change: true,
    };
  }

  if (correctTasks.length > 1) {
    const deduped = await repairDedupeTasks(contact, false);
    if (!deduped.ok) return deduped;
    return {
      ok: true,
      message: `Closed ${mismatchedTasks.length} mismatched task(s) and deduped current-step tasks`,
      would_change: true,
    };
  }

  return {
    ok: true,
    message: `Closed ${mismatchedTasks.length} mismatched task(s); current-step task already healthy`,
    would_change: true,
  };
}

async function runSingleRepair(
  action: string,
  contactId: string,
  actorUserId: string,
  dryRun: boolean
): Promise<RepairResult> {
  const contactResult = await loadContact(contactId);
  if (contactResult.error) {
    return { ok: false, error: contactResult.error };
  }

  if (!contactResult.data) {
    return { ok: false, error: "Contact not found" };
  }

  switch (action) {
    case "recreate_current_task":
      return await repairRecreateCurrentTask(contactResult.data, dryRun);
    case "dedupe_tasks":
      return await repairDedupeTasks(contactResult.data, dryRun);
    case "stop_cadence":
      return await repairStopCadence(contactResult.data, actorUserId, dryRun);
    case "recalculate_due_date":
      return await repairRecalculateDueDate(contactResult.data, dryRun);
    case "resync_tasks":
      return await repairResyncTasks(contactResult.data, dryRun);
    default:
      return { ok: false, error: "Unsupported action" };
  }
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

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "").trim();
  const contact_id = String(body?.contact_id || "").trim();
  const contact_ids = Array.isArray(body?.contact_ids)
    ? body.contact_ids.map((x: any) => String(x || "").trim()).filter(Boolean)
    : [];
  const dry_run = Boolean(body?.dry_run);

  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const isBulk = contact_ids.length > 0;

  if (!isBulk && !contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  if (!isBulk) {
    const result = await runSingleRepair(action, contact_id, me, dry_run);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (!dry_run) {
      await supabaseAdmin.from("activities").insert({
        contact_id,
        user_id: me,
        type: "system",
        occurred_at: new Date().toISOString(),
        subject: "Cadence repair action",
        body: `Admin repair action executed: ${action}. ${result.message}`,
        outcome: "cadence_repair",
      });
    }

    return NextResponse.json({
      ok: true,
      action,
      dry_run,
      message: result.message,
      would_change: Boolean(result.would_change),
    });
  }

  const results: {
    contact_id: string;
    ok: boolean;
    message?: string;
    error?: string;
    would_change?: boolean;
  }[] = [];

  for (const id of contact_ids) {
    const result = await runSingleRepair(action, id, me, dry_run);

    results.push({
      contact_id: id,
      ok: result.ok,
      message: result.ok ? result.message : undefined,
      error: result.ok ? undefined : result.error,
      would_change: result.ok ? Boolean(result.would_change) : undefined,
    });

    if (!dry_run && result.ok) {
      await supabaseAdmin.from("activities").insert({
        contact_id: id,
        user_id: me,
        type: "system",
        occurred_at: new Date().toISOString(),
        subject: "Cadence bulk repair action",
        body: `Admin bulk repair action executed: ${action}. ${result.message}`,
        outcome: "cadence_repair",
      });
    }
  }

  const success_count = results.filter((r) => r.ok).length;
  const failure_count = results.length - success_count;
  const would_change_count = results.filter((r) => r.would_change).length;

  return NextResponse.json({
    ok: true,
    bulk: true,
    action,
    dry_run,
    success_count,
    failure_count,
    would_change_count,
    results,
  });
}