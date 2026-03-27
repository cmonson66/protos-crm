// src/app/api/tasks/by-id/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const taskId = (url.searchParams.get("task_id") || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "task_id is required" }, { status: 400 });
    }

    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .select(`
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
        completed_at
      `)
      .eq("id", taskId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (!isPrivileged(role) && task.assigned_to_user_id !== me && task.owner_user_id !== me) {
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

export async function PATCH(req: Request) {
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

    const task_id = String(body.task_id || "").trim();
    const title =
      body.title === undefined ? undefined : String(body.title || "").trim();
    const notes =
      body.notes === undefined ? undefined : String(body.notes || "").trim();
    const due_at =
      body.due_at === undefined ? undefined : String(body.due_at || "").trim();

    if (!task_id) {
      return NextResponse.json({ error: "task_id is required" }, { status: 400 });
    }

    const { data: task, error: taskErr } = await supabaseAdmin
      .from("tasks")
      .select("id, assigned_to_user_id, owner_user_id, completed_at")
      .eq("id", task_id)
      .maybeSingle();

    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (!isPrivileged(role) && task.assigned_to_user_id !== me && task.owner_user_id !== me) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (task.completed_at) {
      return NextResponse.json({ error: "Completed tasks cannot be edited" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (title !== undefined) updates.title = title || null;
    if (notes !== undefined) updates.notes = notes || null;
    if (due_at !== undefined) updates.due_at = due_at || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error: upErr } = await supabaseAdmin
      .from("tasks")
      .update(updates)
      .eq("id", task_id)
      .select(`
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
        completed_at,
        updated_at
      `)
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}