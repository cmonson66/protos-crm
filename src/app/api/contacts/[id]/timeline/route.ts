import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type TimelineKind =
  | "activity"
  | "task_open"
  | "task_completed"
  | "cadence_started"
  | "cadence_restarted"
  | "cadence_stopped"
  | "cadence_repaired"
  | "status_changed"
  | "assignment_changed"
  | "contact_updated";

type TimelineItem = {
  id: string;
  ts: string;
  kind: TimelineKind;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  actor_user_id?: string | null;
  contact_id: string;
  meta?: Record<string, unknown>;
};

function classifyActivity(activity: {
  id: string;
  type: string | null;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  occurred_at: string;
  user_id: string | null;
  duration_seconds?: number | null;
}) : TimelineItem {
  const subject = String(activity.subject || "").trim();
  const body = activity.body ?? null;
  const type = String(activity.type || "").trim().toLowerCase();

  const lowerSubject = subject.toLowerCase();
  const lowerBody = String(body || "").toLowerCase();

  let kind: TimelineKind = "activity";
  let title = subject || type.toUpperCase() || "Activity";
  let subtitle: string | null = null;

  if (type === "cadence") {
    if (lowerSubject.includes("restarted")) {
      kind = "cadence_restarted";
      title = "Cadence restarted";
    } else if (lowerSubject.includes("started")) {
      kind = "cadence_started";
      title = "Cadence started";
    } else if (lowerSubject.includes("stopped")) {
      kind = "cadence_stopped";
      title = "Cadence stopped";
    } else if (lowerSubject.includes("repair") || lowerBody.includes("repair")) {
      kind = "cadence_repaired";
      title = "Cadence repaired";
    } else {
      kind = "activity";
      title = subject || "Cadence event";
    }
  } else if (type === "note") {
    if (lowerSubject.includes("contact reassigned")) {
      kind = "assignment_changed";
      title = "Assignment changed";
    } else if (lowerSubject.includes("status updated")) {
      kind = "status_changed";
      title = "Status changed";
    } else if (lowerSubject.includes("contact updated")) {
      kind = "contact_updated";
      title = "Contact updated";
    } else if (lowerSubject.includes("user profile updated")) {
      kind = "activity";
      title = subject || "Note";
    } else {
      kind = "activity";
      title = subject || "Note";
    }
  } else if (type === "call") {
    title = subject || "Call logged";
    subtitle = activity.outcome ? `Outcome: ${activity.outcome}` : null;
  } else if (type === "email") {
    title = subject || "Email logged";
    subtitle = activity.outcome ? `Outcome: ${activity.outcome}` : null;
  } else if (type === "meeting") {
    title = subject || "Meeting logged";
    subtitle = activity.outcome ? `Outcome: ${activity.outcome}` : null;
  } else if (type === "text") {
    title = subject || "Text logged";
    subtitle = activity.outcome ? `Outcome: ${activity.outcome}` : null;
  } else if (type === "touch") {
    title = subject || "Touch completed";
    subtitle =
      typeof activity.duration_seconds === "number"
        ? `Duration: ${activity.duration_seconds}s`
        : null;
  }

  return {
    id: `activity_${activity.id}`,
    ts: activity.occurred_at,
    kind,
    title,
    subtitle,
    body,
    actor_user_id: activity.user_id ?? null,
    contact_id: "",
    meta: {
      activity_id: activity.id,
      type: activity.type,
      outcome: activity.outcome ?? null,
      duration_seconds: activity.duration_seconds ?? null,
    },
  };
}

function classifyTask(task: {
  id: string;
  contact_id: string;
  title: string | null;
  task_type: string | null;
  due_at: string | null;
  completed_at: string | null;
  notes: string | null;
  status: string | null;
  kind: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  created_at: string;
  assigned_to_user_id: string | null;
}) : TimelineItem[] {
  const items: TimelineItem[] = [];

  items.push({
    id: `task_open_${task.id}`,
    ts: task.created_at,
    kind: "task_open",
    title: task.kind === "cadence"
      ? `Cadence task created${task.cadence_step ? ` — Step ${task.cadence_step}` : ""}`
      : (task.title || "Task created"),
    subtitle: task.task_type ? `Type: ${task.task_type}` : null,
    body: task.notes ?? null,
    actor_user_id: task.assigned_to_user_id ?? null,
    contact_id: task.contact_id,
    meta: {
      task_id: task.id,
      task_type: task.task_type ?? null,
      due_at: task.due_at ?? null,
      status: task.status ?? null,
      kind: task.kind ?? null,
      cadence_key: task.cadence_key ?? null,
      cadence_step: task.cadence_step ?? null,
    },
  });

  if (task.completed_at) {
    items.push({
      id: `task_completed_${task.id}`,
      ts: task.completed_at,
      kind: "task_completed",
      title: task.kind === "cadence"
        ? `Cadence task completed${task.cadence_step ? ` — Step ${task.cadence_step}` : ""}`
        : (task.title || "Task completed"),
      subtitle: task.task_type ? `Type: ${task.task_type}` : null,
      body: task.notes ?? null,
      actor_user_id: task.assigned_to_user_id ?? null,
      contact_id: task.contact_id,
      meta: {
        task_id: task.id,
        task_type: task.task_type ?? null,
        due_at: task.due_at ?? null,
        status: task.status ?? null,
        kind: task.kind ?? null,
        cadence_key: task.cadence_key ?? null,
        cadence_step: task.cadence_step ?? null,
      },
    });
  }

  return items;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const params = await context.params;
  const contactId = String(params.id || "").trim();

  if (!contactId) {
    return NextResponse.json({ error: "Contact id required" }, { status: 400 });
  }

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      assigned_to_user_id,
      owner_user_id
    `)
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (
    !isPrivileged(role) &&
    contact.assigned_to_user_id !== me &&
    contact.owner_user_id !== me
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: activities, error: activitiesErr } = await supabaseAdmin
    .from("activities")
    .select(`
      id,
      contact_id,
      user_id,
      type,
      occurred_at,
      subject,
      body,
      outcome,
      duration_seconds,
      created_at
    `)
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(150);

  if (activitiesErr) {
    return NextResponse.json({ error: activitiesErr.message }, { status: 500 });
  }

  const { data: tasks, error: tasksErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      contact_id,
      assigned_to_user_id,
      title,
      task_type,
      due_at,
      completed_at,
      notes,
      status,
      kind,
      cadence_key,
      cadence_step,
      created_at
    `)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(150);

  if (tasksErr) {
    return NextResponse.json({ error: tasksErr.message }, { status: 500 });
  }

  const userIds = Array.from(
    new Set(
      [
        ...(activities ?? []).map((a) => a.user_id).filter(Boolean),
        ...(tasks ?? []).map((t) => t.assigned_to_user_id).filter(Boolean),
      ].map(String)
    )
  );

  let actorMap: Record<string, { full_name: string | null; email: string | null }> = {};

  if (userIds.length) {
    const { data: users, error: usersErr } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    actorMap = Object.fromEntries(
      (users ?? []).map((u) => [
        u.user_id,
        { full_name: u.full_name ?? null, email: u.email ?? null },
      ])
    );
  }

  const activityItems: TimelineItem[] = (activities ?? []).map((activity) => {
    const item = classifyActivity(activity);
    return {
      ...item,
      contact_id: activity.contact_id,
      meta: {
        ...(item.meta ?? {}),
        created_at: activity.created_at ?? null,
      },
    };
  });

  const taskItems: TimelineItem[] = (tasks ?? []).flatMap((task) => classifyTask(task));

  const timeline = [...activityItems, ...taskItems]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .map((item) => {
      const actor = item.actor_user_id ? actorMap[item.actor_user_id] : null;
      return {
        ...item,
        actor: actor
          ? actor.full_name || actor.email || item.actor_user_id
          : null,
      };
    });

  return NextResponse.json({
    contact_id: contactId,
    count: timeline.length,
    items: timeline,
  });
}