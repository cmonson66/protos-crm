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
}) {
  const { actorRole, actorUserId, targetUserId, targetRole, targetIsAdmin } = args;

  if (actorRole === "admin") return true;
  if (actorRole !== "manager") return false;

  if (actorUserId === targetUserId) return false;
  if (targetIsAdmin || targetRole === "admin") return false;

  return true;
}

export default function RepsPage() {
  const [rows, setRows] = useState<RepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("rep");
  const [busy, setBusy] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);

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

  useEffect(() => {
    if (!inviteRoleOptions.includes(inviteRole)) {
      setInviteRole(inviteRoleOptions[0]);
    }
  }, [inviteRole, inviteRoleOptions]);

  async function invite() {
    if (!me) return;
    if (!isPrivileged) {
      setErr("You do not have access to invite users.");
      return;
    }

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/reps/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        full_name: inviteName,
        role: inviteRole,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Invite failed");
    } else {
      setInviteEmail("");
      setInviteName("");
      setInviteRole("rep");
      await load();
    }

    setBusy(false);
  }

  async function updateRep(
    user_id: string,
    patch: Partial<Pick<RepRow, "role" | "is_active">>
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
    });

    if (!canManage) {
      setErr("You do not have permission to modify this user.");
      return;
    }

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/reps/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id, ...patch }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Update failed");
    } else {
      await load();
    }

    setBusy(false);
  }

  if (me && me.role === "rep") {
    return (
      <div>
        <h1 className="text-4xl font-semibold">Reps</h1>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          You do not have access to user administration.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold">Reps</h1>
          <div className="mt-2 text-muted-foreground">
            {loading ? "Loading..." : err ? err : `Loaded ${rows.length} users.`}
          </div>
        </div>

        <button onClick={() => void load()} className="rounded-xl border px-5 py-3">
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-2xl border p-6">
        <div className="text-xl font-semibold">Invite user</div>
        <div className="mt-4 grid grid-cols-[1fr_1fr_200px_140px] gap-3">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email"
            className="rounded-xl border px-4 py-3"
            disabled={!isPrivileged || busy}
          />
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Full name (optional)"
            className="rounded-xl border px-4 py-3"
            disabled={!isPrivileged || busy}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="rounded-xl border px-4 py-3"
            disabled={!isPrivileged || busy}
          >
            {inviteRoleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !isPrivileged || !inviteEmail.trim()}
            onClick={() => void invite()}
            className="rounded-xl border px-5 py-3 disabled:opacity-50"
          >
            Invite
          </button>
        </div>

        {me?.role === "manager" ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Managers can invite reps and managers, but cannot create or modify admins.
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Active</th>
              <th className="p-3 text-left">Actions</th>
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
                  })
                : false;

              const roleOptions: Role[] =
                me?.role === "admin"
                  ? ["rep", "manager", "admin"]
                  : ["rep", "manager"];

              return (
                <tr key={r.user_id} className="border-b">
                  <td className="p-3">{r.full_name ?? ""}</td>
                  <td className="p-3">{r.email ?? ""}</td>
                  <td className="p-3">
                    {canManage ? (
                      <select
                        value={targetRole}
                        disabled={busy}
                        onChange={(e) =>
                          void updateRep(r.user_id, { role: e.target.value as Role })
                        }
                        className="rounded-lg border px-3 py-2"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                        {targetRole}
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {canManage ? (
                      <input
                        type="checkbox"
                        checked={r.is_active}
                        disabled={busy}
                        onChange={(e) =>
                          void updateRep(r.user_id, { is_active: e.target.checked })
                        }
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-muted-foreground">
                    {isSelf
                      ? "Self protected"
                      : !canManage && targetRole === "admin"
                      ? "Admin protected"
                      : !canManage
                      ? "Restricted"
                      : "—"}
                  </td>
                </tr>
              );
            })}

            {!loading && !err && rows.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  No reps returned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}