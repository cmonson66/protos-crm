"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type MeResponse = {
  user_id: string;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
};

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

type LeaderboardRow = {
  rep_user_id: string;
  rep_name: string;
  metric_sales: number;
  metric_revenue: number;
  metric_calls: number;
  metric_meetings: number;
  metric_conversions: number;
  rank_override: number | null;
  notes: string;
};

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentWeekKey() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export default function AdminLeaderboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("monthly");
  const [periodKey, setPeriodKey] = useState(currentMonthKey());
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isPrivileged = me?.role === "admin" || me?.role === "manager";

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (periodType === "monthly") setPeriodKey(currentMonthKey());
    else setPeriodKey(currentWeekKey());
  }, [periodType]);

  async function loadMe() {
    const res = await fetchWithAuth("/api/auth/me");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setMe(json as MeResponse);
  }

  async function loadReps() {
    const res = await fetchWithAuth("/api/reps/list");
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setReps(((json.data ?? []) as RepRow[]).filter((r) => r.is_active));
    }
  }

  async function loadExisting() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth(
      `/api/leaderboard/list?period_type=${encodeURIComponent(periodType)}&period_key=${encodeURIComponent(periodKey)}`
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load leaderboard");
      setRows([]);
      setLoading(false);
      return;
    }

    const existing = (json.data ?? []) as any[];

    const merged: LeaderboardRow[] = reps.map((rep) => {
      const found = existing.find((x) => x.rep_user_id === rep.user_id);
      return {
        rep_user_id: rep.user_id,
        rep_name: rep.full_name || rep.email || rep.user_id,
        metric_sales: Number(found?.metric_sales || 0),
        metric_revenue: Number(found?.metric_revenue || 0),
        metric_calls: Number(found?.metric_calls || 0),
        metric_meetings: Number(found?.metric_meetings || 0),
        metric_conversions: Number(found?.metric_conversions || 0),
        rank_override: found?.rank_override ?? null,
        notes: found?.notes || "",
      };
    });

    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    void loadMe();
    void loadReps();
  }, []);

  useEffect(() => {
    if (reps.length > 0) {
      void loadExisting();
    }
  }, [reps, periodType, periodKey]);

  const sortedPreview = useMemo(() => {
    return rows.slice().sort((a, b) => {
      const aOverride = a.rank_override ?? Number.MAX_SAFE_INTEGER;
      const bOverride = b.rank_override ?? Number.MAX_SAFE_INTEGER;
      if (aOverride !== bOverride) return aOverride - bOverride;
      if (b.metric_sales !== a.metric_sales) return b.metric_sales - a.metric_sales;
      if (b.metric_revenue !== a.metric_revenue) return b.metric_revenue - a.metric_revenue;
      if (b.metric_conversions !== a.metric_conversions) return b.metric_conversions - a.metric_conversions;
      return a.rep_name.localeCompare(b.rep_name);
    });
  }, [rows]);

  function updateRow(repUserId: string, patch: Partial<LeaderboardRow>) {
    setRows((prev) =>
      prev.map((row) =>
        row.rep_user_id === repUserId ? { ...row, ...patch } : row
      )
    );
  }

  async function saveAll() {
    setSaving(true);
    setErr(null);

const res = await fetchWithAuth("/api/leaderboard/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        period_type: periodType,
        period_key: periodKey,
        rows,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to save leaderboard");
      setSaving(false);
      return;
    }

    setSaving(false);
    setToast("Leaderboard saved");
    await loadExisting();
  }

  if (me && !isPrivileged) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        Forbidden
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Leaderboard Admin</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            Manager/admin-only update console for weekly and monthly leaderboard standings.
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as "weekly" | "monthly")}
            className="rounded-xl border px-4 py-3"
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>

          <input
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            className="rounded-xl border px-4 py-3"
            placeholder={periodType === "monthly" ? "YYYY-MM" : "YYYY-W##"}
          />

          <button
            onClick={() => void loadExisting()}
            className="rounded-xl border px-5 py-3"
          >
            Reload
          </button>

          <button
            onClick={() => void saveAll()}
            disabled={saving}
            className="rounded-xl border px-5 py-3"
          >
            {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      </div>

      {loading ? <div className="text-muted-foreground">Loading leaderboard admin...</div> : null}
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div> : null}

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Preview Order</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sortedPreview.map((row, idx) => (
            <div key={row.rep_user_id} className="rounded-full border px-3 py-2 text-sm">
              #{idx + 1} {row.rep_name}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4">Rep</th>
                <th className="py-3 pr-4">Rank Override</th>
                <th className="py-3 pr-4">Sales</th>
                <th className="py-3 pr-4">Revenue</th>
                <th className="py-3 pr-4">Calls</th>
                <th className="py-3 pr-4">Meetings</th>
                <th className="py-3 pr-4">Conversions</th>
                <th className="py-3 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rep_user_id} className="border-b">
                  <td className="py-3 pr-4 font-semibold">{row.rep_name}</td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.rank_override ?? ""}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, {
                          rank_override: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-24 rounded-xl border px-3 py-2"
                    />
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.metric_sales}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, { metric_sales: Number(e.target.value || 0) })
                      }
                      className="w-24 rounded-xl border px-3 py-2"
                    />
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.metric_revenue}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, { metric_revenue: Number(e.target.value || 0) })
                      }
                      className="w-32 rounded-xl border px-3 py-2"
                    />
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.metric_calls}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, { metric_calls: Number(e.target.value || 0) })
                      }
                      className="w-24 rounded-xl border px-3 py-2"
                    />
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.metric_meetings}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, { metric_meetings: Number(e.target.value || 0) })
                      }
                      className="w-24 rounded-xl border px-3 py-2"
                    />
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.metric_conversions}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, {
                          metric_conversions: Number(e.target.value || 0),
                        })
                      }
                      className="w-24 rounded-xl border px-3 py-2"
                    />
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      value={row.notes}
                      onChange={(e) =>
                        updateRow(row.rep_user_id, { notes: e.target.value })
                      }
                      className="w-full min-w-[220px] rounded-xl border px-3 py-2"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}