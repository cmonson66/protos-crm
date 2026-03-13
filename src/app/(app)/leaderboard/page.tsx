"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type MeResponse = {
  user_id: string;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
};

type LeaderboardRow = {
  id: string;
  period_type: "weekly" | "monthly";
  period_key: string;
  rep_user_id: string;
  rep_name: string;
  metric_sales: number;
  metric_revenue: number;
  metric_calls: number;
  metric_meetings: number;
  metric_conversions: number;
  rank_override: number | null;
  notes: string | null;
  updated_at: string;
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

function currency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

export default function LeaderboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("monthly");
  const [periodKey, setPeriodKey] = useState(currentMonthKey());
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (periodType === "monthly") {
      setPeriodKey(currentMonthKey());
    } else {
      setPeriodKey(currentWeekKey());
    }
  }, [periodType]);

  async function loadMe() {
    const res = await fetchWithAuth("/api/auth/me");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setMe(json as MeResponse);
  }

  async function loadRows(type = periodType, key = periodKey) {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth(
      `/api/leaderboard/list?period_type=${encodeURIComponent(type)}&period_key=${encodeURIComponent(key)}`
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load leaderboard");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as LeaderboardRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadMe();
  }, []);

  useEffect(() => {
    void loadRows();
  }, [periodType, periodKey]);

  const myRank = useMemo(() => {
    if (!me?.user_id) return null;
    const idx = rows.findIndex((r) => r.rep_user_id === me.user_id);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, me]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Sales Leaderboard</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            Read-only rep view. Compare performance by weekly and monthly period.
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
            onClick={() => void loadRows()}
            className="rounded-xl border px-5 py-3"
          >
            Refresh
          </button>
        </div>
      </div>

      {myRank ? (
        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Your Position</div>
          <div className="mt-2 text-3xl font-semibold">#{myRank}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {periodType} period {periodKey}
          </div>
        </div>
      ) : null}

      {loading ? <div className="text-muted-foreground">Loading leaderboard...</div> : null}
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div> : null}

      <div className="rounded-2xl border p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3 pr-4">Rank</th>
                <th className="py-3 pr-4">Rep</th>
                <th className="py-3 pr-4">Sales</th>
                <th className="py-3 pr-4">Revenue</th>
                <th className="py-3 pr-4">Calls</th>
                <th className="py-3 pr-4">Meetings</th>
                <th className="py-3 pr-4">Conversions</th>
                <th className="py-3 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-muted-foreground">
                    No leaderboard entries for this period.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const isMe = me?.user_id === row.rep_user_id;

                  return (
                    <tr
                      key={row.id}
                      className={isMe ? "border-b bg-slate-50" : "border-b"}
                    >
                      <td className="py-4 pr-4 font-semibold">#{idx + 1}</td>
                      <td className="py-4 pr-4 font-semibold">{row.rep_name}</td>
                      <td className="py-4 pr-4">{row.metric_sales}</td>
                      <td className="py-4 pr-4">{currency(row.metric_revenue)}</td>
                      <td className="py-4 pr-4">{row.metric_calls}</td>
                      <td className="py-4 pr-4">{row.metric_meetings}</td>
                      <td className="py-4 pr-4">{row.metric_conversions}</td>
                      <td className="py-4 pr-4 text-muted-foreground">{row.notes || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}