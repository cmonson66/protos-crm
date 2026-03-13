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
    .select("role,is_admin,is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { role: "rep" as Role, is_active: true };

  const role: Role = data.is_admin ? "admin" : ((data.role as Role) || "rep");

  return { role, is_active: data.is_active };
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