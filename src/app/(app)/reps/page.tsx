"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Role = "admin" | "manager" | "rep";

type RepRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  is_admin?: boolean;
  manager_user_id?: string | null;
};

type MeResponse = {
  user_id: string;
  role: Role;
  is_active: boolean;
};

function canManageTarget(args: {
  actorRole: Role;
  actorUserId: string;
  targetUserId: string;
  targetRole: Role;
  targetIsAdmin?: boolean;
  targetManagerUserId?: string | null;
}) {
  const {
    actorRole,
    actorUserId,
    targetUserId,
    targetRole,
    targetIsAdmin,
    targetManagerUserId,
  } = args;

  if (actorRole === "admin") return true;
  if (actorRole !== "manager") return false;

  if (actorUserId === targetUserId) return false;
  if (targetIsAdmin || targetRole === "admin") return false;
  if (targetManagerUserId !== actorUserId) return false;

  return true;
}

function roleTone(role: Role) {
  if (role === "admin") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (role === "manager") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function activeTone(active: boolean) {
  return active
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

export default function RepsPage() {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("rep");
  const [inviteManagerUserId, setInviteManagerUserId] = useState<string>("");

  const [busy, setBusy] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);

  function clearBanners() {
    setErr(null);
    setSuccess(null);
    setActionLink(null);
  }

  async function copyActionLink() {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setSuccess("Setup link copied to clipboard.");
    } catch {
      setErr("Failed to copy link.");
    }
  }

  async function loadMe() {
    const res = await fetchWithAuth("/api/auth/me");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load current user");
      return;
    }

    setMe(json as MeResponse);
  }

  async function load() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth("/api/reps/list");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load reps");
      setRows([]);
    } else {
      setRows((json.data ?? []) as RepRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadMe();
    void load();
  }, []);

  const isPrivileged = me?.role === "admin" || me?.role === "manager";

  const inviteRoleOptions = useMemo(() => {
    if (!me) return ["rep"] as Role[];
    if (me.role === "admin") return ["rep", "manager", "admin"] as Role[];
    if (me.role === "manager") return ["rep", "manager"] as Role[];
    return ["rep"] as Role[];
  }, [me]);

  const managerOptions = useMemo(() => {
    return rows.filter((r) => {
      const role = r.is_admin ? "admin" : r.role;
      return role === "manager";
    });
  }, [rows]);

  const summary = useMemo(() => {
    const activeCount = rows.filter((r) => r.is_active).length;
    const admins = rows.filter((r) => (r.is_admin ? "admin" : r.role) === "admin").length;
    const managers = rows.filter((r) => (r.is_admin ? "admin" : r.role) === "manager").length;
    const reps = rows.filter((r) => (r.is_admin ? "admin" : r.role) === "rep").length;

    return {
      total: rows.length,
      active: activeCount,
      admins,
      managers,
      reps,
    };
  }, [rows]);

  useEffect(() => {
    if (!inviteRoleOptions.includes(inviteRole)) {
      setInviteRole(inviteRoleOptions[0]);
    }
  }, [inviteRole, inviteRoleOptions]);

  useEffect(() => {
    if (me?.role === "manager") {
      setInviteManagerUserId(me.user_id);
    }
  }, [me]);

  async function invite() {
    if (!me) return;
    if (!isPrivileged) {
      setErr("You do not have access to invite users.");
      return;
    }

    setBusy(true);
    clearBanners();

    const manager_user_id =
      inviteRole === "admin"
        ? null
        : me.role === "manager"
          ? me.user_id
          : inviteManagerUserId || null;

    const res = await fetchWithAuth("/api/reps/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        full_name: inviteName,
        role: inviteRole,
        manager_user_id,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Invite failed");
    } else {
      setInviteEmail("");
      setInviteName("");
      setInviteRole("rep");
      if (me.role === "admin") setInviteManagerUserId("");

      setSuccess(json?.message || "Invite processed successfully.");
      setActionLink(json?.action_link || null);

      await load();
    }

    setBusy(false);
  }

  async function updateRep(
    user_id: string,
    patch: Partial<Pick<RepRow, "role" | "is_active" | "manager_user_id">>
  ) {
    if (!me) return;

    const target = rows.find((r) => r.user_id === user_id);
    if (!target) {
      setErr("Target user not found.");
      return;
    }

    const targetRole: Role = target.is_admin ? "admin" : target.role;
    const canManage = canManageTarget({
      actorRole: me.role,
      actorUserId: me.user_id,
      targetUserId: target.user_id,
      targetRole,
      targetIsAdmin: !!target.is_admin,
      targetManagerUserId: target.manager_user_id ?? null,
    });

    if (!canManage && me.role !== "admin") {
      setErr("You do not have permission to modify this user.");
      return;
    }

    setBusy(true);
    clearBanners();

    const res = await fetchWithAuth("/api/reps/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id, ...patch }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Update failed");
    } else {
      setSuccess("User updated.");
      await load();
    }

    setBusy(false);
  }

  async function resendInvite(user_id: string) {
    const target = rows.find((r) => r.user_id === user_id);
    if (!target) {
      setErr("Target user not found.");
      return;
    }

    setBusy(true);
    clearBanners();

    const res = await fetchWithAuth("/api/reps/resend-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to generate setup link");
    } else {
      setSuccess(json?.message || "Fresh setup link generated.");
      setActionLink(json?.action_link || null);
    }

    setBusy(false);
  }

  async function deleteRep(user_id: string) {
    if (!me) return;

    const target = rows.find((r) => r.user_id === user_id);
    if (!target) {
      setErr("Target user not found.");
      return;
    }

    const label = target.full_name || target.email || target.user_id;
    const ok = window.confirm(
      `Delete ${label}?\n\nThis removes the auth user and their linked profile. This cannot be undone.`
    );

    if (!ok) return;

    setBusy(true);
    clearBanners();

    const res = await fetchWithAuth("/api/reps/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Delete failed");
    } else {
      setSuccess("User deleted.");
      await load();
    }

    setBusy(false);
  }

  if (me && me.role === "rep") {
    return (
      <div className="space-y-8 p-6">
        <div className="crm-card overflow-hidden p-0">
          <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
            <div className="text-4xl font-semibold tracking-tight text-slate-900">
              Reps
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                Restricted
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              User administration is limited to managers and admins.
            </div>
          </div>
        </div>

        <div className="crm-card border-amber-200 bg-amber-50 p-4 text-amber-900">
          You do not have access to user administration.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                Reps
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  User Administration
                </span>

                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  {me?.role ? me.role.toUpperCase() : "LOADING"}
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {loading ? "Loading..." : `${rows.length} user${rows.length === 1 ? "" : "s"}`}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Invite, assign, manage roles, and maintain rep access.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void load()}
                className="crm-button px-5 py-2.5"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total Users
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.total}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.active}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Admins
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.admins}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Managers
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.managers}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Reps
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.reps}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      {success ? (
        <div className="crm-card border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <div className="font-medium">{success}</div>

          {actionLink ? (
            <div className="mt-3 space-y-3">
              <div className="break-all rounded-xl border border-emerald-200 bg-white p-3 text-sm">
                {actionLink}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyActionLink()}
                  className="crm-button px-3 py-2 text-sm"
                >
                  Copy Link
                </button>

                <a
                  href={actionLink}
                  target="_blank"
                  rel="noreferrer"
                  className="crm-button px-3 py-2 text-sm"
                >
                  Open Link
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Invite User
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Create a new user record and generate a setup link.
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[1.1fr_1fr_180px_220px_140px]">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email"
            className="crm-input px-4 py-3"
            disabled={!isPrivileged || busy}
          />

          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name (optional)"
            className="crm-input px-4 py-3"
            disabled={!isPrivileged || busy}
          />

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="crm-input px-4 py-3"
            disabled={!isPrivileged || busy}
          >
            {inviteRoleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            value={inviteRole === "admin" ? "" : inviteManagerUserId}
            onChange={(e) => setInviteManagerUserId(e.target.value)}
            className="crm-input px-4 py-3"
            disabled={
              !isPrivileged ||
              busy ||
              inviteRole === "admin" ||
              me?.role === "manager"
            }
          >
            <option value="">No manager</option>
            {managerOptions.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email || m.user_id}
              </option>
            ))}
          </select>

          <button
            disabled={busy || !isPrivileged || !inviteEmail.trim()}
            onClick={() => void invite()}
            className="crm-button-primary px-5 py-3 disabled:opacity-50"
          >
            Invite
          </button>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Team Directory
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Manage role, reporting structure, and access state.
            </div>
          </div>

          <div className="text-sm text-slate-500">
            {loading ? "Loading..." : `${rows.length} user${rows.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-semibold">Name</th>
                <th className="py-3 pr-4 font-semibold">Email</th>
                <th className="py-3 pr-4 font-semibold">Role</th>
                <th className="py-3 pr-4 font-semibold">Manager</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const targetRole: Role = r.is_admin ? "admin" : r.role;
                const isSelf = me?.user_id === r.user_id;

                const canManage = me
                  ? canManageTarget({
                      actorRole: me.role,
                      actorUserId: me.user_id,
                      targetUserId: r.user_id,
                      targetRole,
                      targetIsAdmin: !!r.is_admin,
                      targetManagerUserId: r.manager_user_id ?? null,
                    }) || me.role === "admin"
                  : false;

                const roleOptions: Role[] =
                  me?.role === "admin"
                    ? ["rep", "manager", "admin"]
                    : ["rep", "manager"];

                const managerLabel =
                  rows.find((x) => x.user_id === r.manager_user_id)?.full_name ||
                  rows.find((x) => x.user_id === r.manager_user_id)?.email ||
                  "—";

                return (
                  <tr key={r.user_id} className="border-b border-slate-200">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-slate-900">
                        {r.full_name || "—"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {isSelf ? "You" : r.user_id}
                      </div>
                    </td>

                    <td className="py-4 pr-4 text-slate-700">
                      {r.email ?? ""}
                    </td>

                    <td className="py-4 pr-4">
                      {canManage ? (
                        <select
                          value={targetRole}
                          disabled={busy}
                          onChange={(e) =>
                            void updateRep(r.user_id, {
                              role: e.target.value as Role,
                            })
                          }
                          className="crm-input px-3 py-2"
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${roleTone(
                            targetRole
                          )}`}
                        >
                          {targetRole}
                        </span>
                      )}
                    </td>

                    <td className="py-4 pr-4">
                      {canManage && targetRole !== "admin" ? (
                        <select
                          value={r.manager_user_id ?? ""}
                          disabled={busy || me?.role === "manager"}
                          onChange={(e) =>
                            void updateRep(r.user_id, {
                              manager_user_id: e.target.value || null,
                            })
                          }
                          className="crm-input px-3 py-2"
                        >
                          <option value="">No manager</option>
                          {managerOptions.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.full_name || m.email || m.user_id}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-600">{managerLabel}</span>
                      )}
                    </td>

                    <td className="py-4 pr-4">
                      {canManage ? (
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={r.is_active}
                            disabled={busy}
                            onChange={(e) =>
                              void updateRep(r.user_id, {
                                is_active: e.target.checked,
                              })
                            }
                          />
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${activeTone(
                              r.is_active
                            )}`}
                          >
                            {r.is_active ? "Active" : "Inactive"}
                          </span>
                        </label>
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${activeTone(
                            r.is_active
                          )}`}
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>

                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {isSelf
                            ? "Self protected"
                            : !canManage && targetRole === "admin"
                              ? "Admin protected"
                              : !canManage
                                ? "Restricted"
                                : "Manageable"}
                        </span>

                        {canManage && !isSelf ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void resendInvite(r.user_id)}
                              className="crm-button px-3 py-2 text-xs disabled:opacity-50"
                            >
                              Resend Invite
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteRep(r.user_id)}
                              className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && !rows.length && !err && (
                <tr>
                  <td className="py-6 text-slate-500" colSpan={6}>
                    No reps returned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}