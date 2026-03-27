import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type QueueTask = {
  id: string;
  due_at: string | null;
  title: string | null;
  notes: string | null;
  task_type: string;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  contact_id: string;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  contacts: {
    id: string;
    vertical: "coaching" | "corporate";
    first_name: string | null;
    last_name: string | null;
    primary_email: string | null;
    job_title_raw: string | null;
    sport: string | null;
    schools: { name: string | null }[] | null;
    accounts: { name: string | null }[] | null;
  }[] | null;
};

function taskPriorityScore(task: QueueTask) {
  const notes = String(task.notes || "").toLowerCase();
  const title = String(task.title || "").toLowerCase();

  if (
    notes.includes("queue_source=radar_promotion") ||
    notes.includes("promoted from priority radar") ||
    title.startsWith("work now:")
  ) {
    return 0;
  }

  if (task.kind === "cadence" || task.cadence_key || Number(task.cadence_step || 0) > 0) {
    return 1;
  }

  if (task.kind === "manual") {
    return 2;
  }

  return 3;
}

function dueAtMs(ts: string | null) {
  if (!ts) return Number.MAX_SAFE_INTEGER;
  const n = new Date(ts).getTime();
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const excludeTaskId = (url.searchParams.get("exclude_task_id") || "").trim();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (userErr || !userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: meProfile, error: profErr } = await supabase
      .from("user_profiles")
      .select("is_admin, role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    if (!meProfile?.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const isPrivileged =
      !!meProfile?.is_admin ||
      meProfile?.role === "admin" ||
      meProfile?.role === "manager";

    let q = supabase
      .from("tasks")
      .select(
        `
        id,
        due_at,
        title,
        notes,
        task_type,
        status,
        kind,
        cadence_key,
        cadence_step,
        contact_id,
        assigned_to_user_id,
        owner_user_id,
        contacts(
          id,
          vertical,
          first_name,
          last_name,
          primary_email,
          job_title_raw,
          sport,
          schools(name),
          accounts!contacts_account_id_fkey(name)
        )
      `
      )
      .is("completed_at", null)
      .order("due_at", { ascending: true })
      .limit(200);

    if (excludeTaskId) {
      q = q.neq("id", excludeTaskId);
    }

    if (!isPrivileged) {
      q = q.eq("assigned_to_user_id", userId);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let tasks = ((data ?? []) as QueueTask[]).filter((t) => !!t.contact_id);

    if (isPrivileged) {
      tasks = tasks.filter(
        (t) =>
          t.assigned_to_user_id === userId ||
          t.owner_user_id === userId ||
          !t.assigned_to_user_id
      );
    }

    tasks.sort((a, b) => {
      const pa = taskPriorityScore(a);
      const pb = taskPriorityScore(b);
      if (pa !== pb) return pa - pb;

      const da = dueAtMs(a.due_at);
      const db = dueAtMs(b.due_at);
      if (da !== db) return da - db;

      return a.id.localeCompare(b.id);
    });

    return NextResponse.json({ data: tasks[0] ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}