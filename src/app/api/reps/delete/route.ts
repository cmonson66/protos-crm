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

  const targetLabel = target.full_name || target.email || target.user_id;

  // 1) Clear references from contacts
  const { error: contactsAssignedErr } = await supabaseAdmin
    .from("contacts")
    .update({ assigned_to_user_id: null })
    .eq("assigned_to_user_id", user_id);

  if (contactsAssignedErr) {
    return NextResponse.json(
      { error: `Failed clearing contact assignments: ${contactsAssignedErr.message}` },
      { status: 500 }
    );
  }

  const { error: contactsOwnerErr } = await supabaseAdmin
    .from("contacts")
    .update({ owner_user_id: null })
    .eq("owner_user_id", user_id);

  if (contactsOwnerErr) {
    return NextResponse.json(
      { error: `Failed clearing contact ownership: ${contactsOwnerErr.message}` },
      { status: 500 }
    );
  }

  // 2) Clear references from tasks
  const { error: tasksAssignedErr } = await supabaseAdmin
    .from("tasks")
    .update({ assigned_to_user_id: null })
    .eq("assigned_to_user_id", user_id);

  if (tasksAssignedErr) {
    return NextResponse.json(
      { error: `Failed clearing task assignments: ${tasksAssignedErr.message}` },
      { status: 500 }
    );
  }

  const { error: tasksOwnerErr } = await supabaseAdmin
    .from("tasks")
    .update({ owner_user_id: null })
    .eq("owner_user_id", user_id);

  if (tasksOwnerErr) {
    return NextResponse.json(
      { error: `Failed clearing task ownership: ${tasksOwnerErr.message}` },
      { status: 500 }
    );
  }

  // 3) Remove this user as manager from other profiles
  const { error: managerRefErr } = await supabaseAdmin
    .from("user_profiles")
    .update({ manager_user_id: null })
    .eq("manager_user_id", user_id);

  if (managerRefErr) {
    return NextResponse.json(
      { error: `Failed clearing manager references: ${managerRefErr.message}` },
      { status: 500 }
    );
  }

  // 4) Delete this user's activities
  const { error: activitiesErr } = await supabaseAdmin
    .from("activities")
    .delete()
    .eq("user_id", user_id);

  if (activitiesErr) {
    return NextResponse.json(
      { error: `Failed deleting user activities: ${activitiesErr.message}` },
      { status: 500 }
    );
  }

  // 5) Delete the profile row first
  const { error: profileDeleteErr } = await supabaseAdmin
    .from("user_profiles")
    .delete()
    .eq("user_id", user_id);

  if (profileDeleteErr) {
    return NextResponse.json(
      { error: `Failed deleting user profile: ${profileDeleteErr.message}` },
      { status: 500 }
    );
  }

  // 6) Delete auth user last
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);

  if (deleteErr) {
    return NextResponse.json(
      { error: `Failed deleting auth user: ${deleteErr.message}` },
      { status: 500 }
    );
  }

  // 7) Audit log
  await supabaseAdmin.from("activities").insert({
    contact_id: null,
    user_id: me,
    type: "note",
    occurred_at: new Date().toISOString(),
    subject: "User deleted",
    body: `User ${targetLabel} was deleted. References in contacts, tasks, manager assignments, and activities were cleared first.`,
  });

  return NextResponse.json({ ok: true });
}