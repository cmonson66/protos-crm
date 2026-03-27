import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canActorManageTargetUser,
  getRole,
  isPrivileged,
  requireUser,
  type Role,
} from "@/lib/apiAuth";

export const runtime = "nodejs";

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

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  if (user_id === me) {
    return NextResponse.json(
      { error: "You cannot delete your own user account from this screen." },
      { status: 403 }
    );
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, role, is_admin, full_name, email, manager_user_id")
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

  const allowed = await canActorManageTargetUser({
    actorUserId: me,
    actorRole,
    targetUserId: target.user_id,
    targetRole,
    targetIsAdmin: !!target.is_admin,
    targetManagerUserId: target.manager_user_id ?? null,
  });

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          actorRole === "manager"
            ? "Managers can only delete users assigned to them and cannot delete admins."
            : "Forbidden",
      },
      { status: 403 }
    );
  }

  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("activities").insert({
    contact_id: null,
    user_id: me,
    type: "note",
    occurred_at: new Date().toISOString(),
    subject: "User deleted",
    body: `User ${target.full_name || target.email || target.user_id} was deleted from auth and profile records.`,
  });

  return NextResponse.json({ ok: true });
}