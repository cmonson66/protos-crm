// src/app/api/reps/list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getManagerScopeUserIds,
  getRole,
  requireUser,
  isPrivileged,
} from "@/lib/apiAuth";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Admin or Manager access required." }, { status: 403 });
  }

  let query = supabaseAdmin
    .from("user_profiles")
    .select(
      "user_id,email,full_name,role,is_active,created_at,updated_at,is_admin,manager_user_id"
    )
    .order("created_at", { ascending: false });

  if (role === "manager") {
    const scopeUserIds = await getManagerScopeUserIds(me, role);
    query = query.in("user_id", scopeUserIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}