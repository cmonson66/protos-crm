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
    sport: string;
    schools: { name: string } | null;
    accounts: { name: string } | null;
  } | null;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const taskId = (url.searchParams.get("task_id") || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "task_id is required" }, { status: 400 });
    }

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

    const { data, error } = await supabase
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
      .eq("id", taskId)
      .is("completed_at", null)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const task = (data ?? null) as QueueTask | null;

    if (!task) {
      return NextResponse.json({ data: null }, { status: 404 });
    }

    if (
      !isPrivileged &&
      task.assigned_to_user_id !== userId &&
      task.owner_user_id !== userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      isPrivileged &&
      task.assigned_to_user_id &&
      task.assigned_to_user_id !== userId &&
      task.owner_user_id !== userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ data: task });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}