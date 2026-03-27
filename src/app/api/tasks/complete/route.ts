// src/app/api/tasks/complete/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

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
  const task_id = String(body.task_id || "").trim();

  if (!task_id) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const { data: task, error: taskErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      contact_id,
      assigned_to_user_id,
      owner_user_id,
      status,
      completed_at,
      kind,
      cadence_key,
      cadence_step
    `)
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
    return NextResponse.json({ ok: true, already_completed: true });
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabaseAdmin
    .from("tasks")
    .update({
      completed_at: now,
      status: "done",
    })
    .eq("id", task_id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (task.kind === "cadence") {
    const { error: advErr } = await supabaseAdmin.rpc("cadence_advance_from_task", {
      p_task_id: task_id,
    });

    if (advErr) {
      return NextResponse.json(
        {
          error: advErr.message,
          details: advErr.details ?? null,
          hint: advErr.hint ?? null,
          code: advErr.code ?? null,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}