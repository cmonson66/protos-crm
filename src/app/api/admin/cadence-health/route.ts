import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  status: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_next_due_at: string | null;
  assigned_to_user_id: string | null;
  school_id?: string | null;
  schools?: { name: string | null }[] | null;
};

type OpenTaskLite = {
  id: string;
  contact_id: string;
  cadence_key: string | null;
  cadence_step: number | null;
  due_at: string | null;
  status: string | null;
  created_at: string | null;
};

function fullName(c: ContactLite) {
  const n = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return n || "(No name)";
}

function schoolName(c: ContactLite) {
  return c.schools?.[0]?.name ?? null;
}

function contactLabel(c: ContactLite) {
  const s = schoolName(c);
  return s ? `${s} — ${fullName(c)}` : fullName(c);
}

export async function GET(req: Request) {
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

  const { data: contacts, error: contactsErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      first_name,
      last_name,
      primary_email,
      status,
      cadence_key,
      cadence_step,
      cadence_status,
      cadence_next_due_at,
      assigned_to_user_id,
      school_id,
      schools(name)
    `)
    .eq("cadence_status", "active");

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const activeContacts = (contacts ?? []) as ContactLite[];

  const contactIds = activeContacts.map((c) => c.id);

  const { data: openTasks, error: tasksErr } = contactIds.length
    ? await supabaseAdmin
        .from("tasks")
        .select(`
          id,
          contact_id,
          cadence_key,
          cadence_step,
          due_at,
          status,
          created_at
        `)
        .eq("kind", "cadence")
        .in("contact_id", contactIds)
        .is("completed_at", null)
    : { data: [], error: null as any };

  if (tasksErr) {
    return NextResponse.json({ error: tasksErr.message }, { status: 500 });
  }

  const openCadenceTasks = (openTasks ?? []) as OpenTaskLite[];

  const cadenceKeys = Array.from(
    new Set(
      activeContacts
        .map((c) => String(c.cadence_key || "").trim())
        .filter(Boolean)
    )
  );

  const { data: templateSteps, error: templatesErr } = cadenceKeys.length
    ? await supabaseAdmin
        .from("cadence_template_steps")
        .select(`
          cadence_key,
          step,
          is_active
        `)
        .in("cadence_key", cadenceKeys)
    : { data: [], error: null as any };

  if (templatesErr) {
    return NextResponse.json({ error: templatesErr.message }, { status: 500 });
  }

  const templateSet = new Set(
    (templateSteps ?? [])
      .filter((t: any) => !!t.is_active)
      .map((t: any) => `${t.cadence_key}::${Number(t.step || 0)}`)
  );

  const tasksByContact = new Map<string, OpenTaskLite[]>();
  for (const task of openCadenceTasks) {
    const list = tasksByContact.get(task.contact_id) ?? [];
    list.push(task);
    tasksByContact.set(task.contact_id, list);
  }

  const activeWithoutTask: any[] = [];
  const duplicateOpenTasks: any[] = [];
  const missingTemplateSteps: any[] = [];
  const activeWithoutNextDueDate: any[] = [];
  const taskStateMismatch: any[] = [];

  for (const contact of activeContacts) {
    const key = String(contact.cadence_key || "").trim();
    const step = Number(contact.cadence_step || 0);
    const label = contactLabel(contact);

    const matchingTasks = (tasksByContact.get(contact.id) ?? []).filter(
      (t) =>
        String(t.cadence_key || "").trim() === key &&
        Number(t.cadence_step || 0) === step
    );

    if (matchingTasks.length === 0) {
      activeWithoutTask.push({
        contact_id: contact.id,
        label,
        cadence_key: key || null,
        cadence_step: step || null,
        cadence_status: contact.cadence_status ?? null,
        cadence_next_due_at: contact.cadence_next_due_at ?? null,
      });
    }

    if (matchingTasks.length > 1) {
      duplicateOpenTasks.push({
        contact_id: contact.id,
        label,
        cadence_key: key || null,
        cadence_step: step || null,
        duplicate_count: matchingTasks.length,
        task_ids: matchingTasks.map((t) => t.id),
      });
    }

    if (key && step > 0 && !templateSet.has(`${key}::${step}`)) {
      missingTemplateSteps.push({
        contact_id: contact.id,
        label,
        cadence_key: key,
        cadence_step: step,
      });
    }

    if (!contact.cadence_next_due_at) {
      activeWithoutNextDueDate.push({
        contact_id: contact.id,
        label,
        cadence_key: key || null,
        cadence_step: step || null,
      });
    }

    for (const task of tasksByContact.get(contact.id) ?? []) {
      const taskKey = String(task.cadence_key || "").trim();
      const taskStep = Number(task.cadence_step || 0);

      if (taskKey !== key || taskStep !== step) {
        taskStateMismatch.push({
          contact_id: contact.id,
          label,
          contact_cadence_key: key || null,
          contact_cadence_step: step || null,
          task_id: task.id,
          task_cadence_key: taskKey || null,
          task_cadence_step: taskStep || null,
          task_due_at: task.due_at ?? null,
        });
      }
    }
  }

  const summary = {
    active_without_task: activeWithoutTask.length,
    duplicate_open_tasks: duplicateOpenTasks.length,
    missing_template_steps: missingTemplateSteps.length,
    active_without_next_due_date: activeWithoutNextDueDate.length,
    task_state_mismatch: taskStateMismatch.length,
    active_contacts_checked: activeContacts.length,
  };

  return NextResponse.json({
    summary,
    sections: {
      active_without_task: activeWithoutTask,
      duplicate_open_tasks: duplicateOpenTasks,
      missing_template_steps: missingTemplateSteps,
      active_without_next_due_date: activeWithoutNextDueDate,
      task_state_mismatch: taskStateMismatch,
    },
  });
}