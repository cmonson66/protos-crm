import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canManagerModifyUser,
  getRole,
  isPrivileged,
  requireUser,
  type Role,
} from "@/lib/apiAuth";

export const runtime = "nodejs";

const ALLOWED_ROLES: Role[] = ["admin", "manager", "rep"];

function isRole(value: string): value is Role {
  return (ALLOWED_ROLES as string[]).includes(value);
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role: actorRole, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(actorRole)) {
    return NextResponse.json(
      { error: "Admin or Manager access required." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const user_id = String(body.user_id || "").trim();
  const rawRole = body.role ? String(body.role).trim() : null;
  const newRole = rawRole && isRole(rawRole) ? rawRole : rawRole ? ("invalid" as Role) : null;
  const is_active_patch =
    typeof body.is_active === "boolean" ? body.is_active : null;

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  if (!newRole && is_active_patch === null) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (rawRole && !isRole(rawRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (user_id === me) {
    return NextResponse.json(
      { error: "You cannot modify your own user account from this screen." },
      { status: 403 }
    );
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, role, is_admin, is_active, full_name, email")
    .eq("user_id", user_id)
    .maybeSingle();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const targetRole: Role = target.is_admin
    ? "admin"
    : ((target.role as Role) || "rep");

  const allowed = canManagerModifyUser({
    actorRole,
    targetRole,
    targetIsAdmin: !!target.is_admin,
    nextRole: newRole,
  });

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          actorRole === "manager"
            ? "Managers cannot change current admin users or promote users to admin."
            : "Forbidden",
      },
      { status: 403 }
    );
  }

  const patch: Record<string, unknown> = {};

  if (newRole) {
    patch.role = newRole;
    patch.is_admin = newRole === "admin";
  }

  if (is_active_patch !== null) {
    patch.is_active = is_active_patch;
  }

  const hasChanges = Object.keys(patch).length > 0;
  if (!hasChanges) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error } = await supabaseAdmin
    .from("user_profiles")
    .update(patch)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const changes: string[] = [];
  if (newRole && newRole !== targetRole) {
    changes.push(`role changed from ${targetRole} to ${newRole}`);
  }
  if (is_active_patch !== null && is_active_patch !== target.is_active) {
    changes.push(`active changed from ${target.is_active ? "true" : "false"} to ${is_active_patch ? "true" : "false"}`);
  }

  await supabaseAdmin.from("activities").insert({
    contact_id: null,
    user_id: me,
    type: "note",
    occurred_at: new Date().toISOString(),
    subject: "User profile updated",
    body: changes.length
      ? `User ${target.full_name || target.email || target.user_id} updated: ${changes.join("; ")}.`
      : `User ${target.full_name || target.email || target.user_id} update requested with no effective change.`,
  });

  return NextResponse.json({ ok: true });
}