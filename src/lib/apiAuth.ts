// src/lib/apiAuth.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Role = "admin" | "manager" | "rep";

export type ContactAccessRecord = {
  owner_user_id?: string | null;
  assigned_to_user_id?: string | null;
};

export async function requireUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return { ok: false as const, status: 401, error: "Missing access token" };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false as const, status: 401, error: "Invalid session" };
  }

  return { ok: true as const, user: data.user, token };
}

export async function getRole(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("role,is_admin,is_active,manager_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return {
      role: "rep" as Role,
      is_active: true,
      manager_user_id: null as string | null,
    };
  }

  const role: Role = data.is_admin ? "admin" : ((data.role as Role) || "rep");

  return {
    role,
    is_active: data.is_active,
    manager_user_id: data.manager_user_id ?? null,
  };
}

export function isAdmin(role: Role) {
  return role === "admin";
}

export function isPrivileged(role: Role) {
  return role === "admin" || role === "manager";
}

export function canCreateContact(role: Role) {
  return role === "admin" || role === "manager" || role === "rep";
}

export function canAssignContact(role: Role) {
  return isPrivileged(role);
}

export function canEditContact(
  role: Role,
  actorUserId: string,
  contact: ContactAccessRecord
) {
  if (isPrivileged(role)) return true;

  return (
    contact.assigned_to_user_id === actorUserId ||
    contact.owner_user_id === actorUserId
  );
}

export async function getManagerScopeUserIds(actorUserId: string, actorRole: Role) {
  if (actorRole === "admin") {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("is_active", true);

    if (error) throw new Error(error.message);

    return Array.from(
      new Set([actorUserId, ...(data ?? []).map((r) => String(r.user_id))])
    );
  }

  if (actorRole === "manager") {
    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("is_active", true)
      .eq("manager_user_id", actorUserId);

    if (error) throw new Error(error.message);

    return Array.from(
      new Set([actorUserId, ...(data ?? []).map((r) => String(r.user_id))])
    );
  }

  return [actorUserId];
}

export async function canActorManageTargetUser(args: {
  actorUserId: string;
  actorRole: Role;
  targetUserId: string;
  targetRole: Role;
  targetIsAdmin: boolean;
  targetManagerUserId?: string | null;
  nextRole?: Role | null;
  nextManagerUserId?: string | null;
}) {
  const {
    actorUserId,
    actorRole,
    targetUserId,
    targetRole,
    targetIsAdmin,
    targetManagerUserId,
    nextRole,
    nextManagerUserId,
  } = args;

  if (actorRole === "admin") return true;
  if (actorRole !== "manager") return false;

  if (actorUserId === targetUserId) return false;
  if (targetIsAdmin || targetRole === "admin") return false;
  if (nextRole === "admin") return false;

  const targetInScope = targetManagerUserId === actorUserId;
  if (!targetInScope) return false;

  if (nextManagerUserId && nextManagerUserId !== actorUserId) return false;

  return true;
}

export function canManagerModifyUser(args: {
  actorRole: Role;
  targetRole: Role;
  targetIsAdmin: boolean;
  nextRole?: Role | null;
}) {
  const { actorRole, targetRole, targetIsAdmin, nextRole } = args;

  if (actorRole === "admin") return true;

  if (actorRole !== "manager") return false;

  if (targetIsAdmin || targetRole === "admin") return false;
  if (nextRole === "admin") return false;

  return true;
}