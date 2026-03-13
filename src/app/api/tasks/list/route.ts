// src/app/api/tasks/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);
  if (!is_active) return NextResponse.json({ error: "User inactive" }, { status: 403 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "open").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);

  let query = supabaseAdmin
    .from("tasks")
    .select("id,contact_id,assigned_to_user_id,task_type,due_at,completed_at,notes,title,status,kind,cadence_key,cadence_step,created_at,updated_at")
    .order("due_at", { ascending: true })
    .limit(limit);

  if (status) query = query.eq("status", status);

  if (!isPrivileged(role)) {
    query = query.eq("assigned_to_user_id", me);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}