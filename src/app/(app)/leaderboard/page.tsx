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
  metric_emails?: number;
  metric_linkedin?: number;
  metric_meetings: number;
  metric_conversions: number;
  metric_commissions_paid_rep?: number;

  rank_override: number | null;
  notes: string | null;
  updated_at: string;
};

type RankMode = "revenue" | "commission" | "activity";

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
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function currency(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function formatPeriodLabel(periodType: "weekly" | "monthly", periodKey: string) {
  return `${periodType === "monthly" ? "Monthly" : "Weekly"} • ${periodKey}`;
}

function rankTone(rank: number) {
  if (rank === 1) return "border-amber-200 bg-amber-50 text-amber-800";
  if (rank === 2) return "border-slate-300 bg-slate-100 text-slate-800";
  if (rank === 3) return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-white text-slate-700";
}

function safeNumber(n: unknown) {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function computeActivityScore(row: LeaderboardRow) {
  const calls = safeNumber(row.metric_calls);
  const emails = safeNumber(row.metric_emails);
  const linkedin = safeNumber(row.metric_linkedin);
  const meetings = safeNumber(row.metric_meetings);
  const conversions = safeNumber(row.metric_conversions);
  const sales = safeNumber(row.metric_sales);

  return (
    calls * 1 +
    emails * 1 +
    linkedin * 1 +
    meetings * 4 +
    conversions * 5 +
    sales * 8
  );
}

function sortRows(rows: LeaderboardRow[], rankMode: RankMode) {
  return rows.slice().sort((a, b) => {
    const aOverride = a.rank_override ?? Number.MAX_SAFE_INTEGER;
    const bOverride = b.rank_override ?? Number.MAX_SAFE_INTEGER;

    if (aOverride !== bOverride) return aOverride - bOverride;

    if (rankMode === "revenue") {
      if (safeNumber(b.metric_revenue) !== safeNumber(a.metric_revenue)) {
        return safeNumber(b.metric_revenue) - safeNumber(a.metric_revenue);
      }
      if (
        safeNumber(b.metric_commissions_paid_rep) !==
        safeNumber(a.metric_commissions_paid_rep)
      ) {
        return (
          safeNumber(b.metric_commissions_paid_rep) -
          safeNumber(a.metric_commissions_paid_rep)
        );
      }
      if (safeNumber(b.metric_sales) !== safeNumber(a.metric_sales)) {
        return safeNumber(b.metric_sales) - safeNumber(a.metric_sales);
      }
      return computeActivityScore(b) - computeActivityScore(a);
    }

    if (rankMode === "commission") {
      if (
        safeNumber(b.metric_commissions_paid_rep) !==
        safeNumber(a.metric_commissions_paid_rep)
      ) {
        return (
          safeNumber(b.metric_commissions_paid_rep) -
          safeNumber(a.metric_commissions_paid_rep)
        );
      }
      if (safeNumber(b.metric_revenue) !== safeNumber(a.metric_revenue)) {
        return safeNumber(b.metric_revenue) - safeNumber(a.metric_revenue);
      }
      if (safeNumber(b.metric_sales) !== safeNumber(a.metric_sales)) {
        return safeNumber(b.metric_sales) - safeNumber(a.metric_sales);
      }
      return computeActivityScore(b) - computeActivityScore(a);
    }

    if (computeActivityScore(b) !== computeActivityScore(a)) {
      return computeActivityScore(b) - computeActivityScore(a);
    }
    if (safeNumber(b.metric_meetings) !== safeNumber(a.metric_meetings)) {
      return safeNumber(b.metric_meetings) - safeNumber(a.metric_meetings);
    }
    if (safeNumber(b.metric_calls) !== safeNumber(a.metric_calls)) {
      return safeNumber(b.metric_calls) - safeNumber(a.metric_calls);
    }
    if (safeNumber(b.metric_emails) !== safeNumber(a.metric_emails)) {
      return safeNumber(b.metric_emails) - safeNumber(a.metric_emails);
    }
    if (safeNumber(b.metric_linkedin) !== safeNumber(a.metric_linkedin)) {
      return safeNumber(b.metric_linkedin) - safeNumber(a.metric_linkedin);
    }
    if (safeNumber(b.metric_conversions) !== safeNumber(a.metric_conversions)) {
      return safeNumber(b.metric_conversions) - safeNumber(a.metric_conversions);
    }
    return safeNumber(b.metric_revenue) - safeNumber(a.metric_revenue);
  });
}

export default function LeaderboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("monthly");
  const [periodKey, setPeriodKey] = useState(currentMonthKey());
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rankMode, setRankMode] = useState<RankMode>("revenue");

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
      `/api/leaderboard/list?period_type=${encodeURIComponent(
        type
      )}&period_key=${encodeURIComponent(key)}`
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, periodKey]);

  const sortedRows = useMemo(() => sortRows(rows, rankMode), [rows, rankMode]);

  const myRank = useMemo(() => {
    if (!me?.user_id) return null;
    const idx = sortedRows.findIndex((r) => r.rep_user_id === me.user_id);
    return idx >= 0 ? idx + 1 : null;
  }, [sortedRows, me]);

  const myRow = useMemo(() => {
    if (!me?.user_id) return null;
    return sortedRows.find((r) => r.rep_user_id === me.user_id) ?? null;
  }, [sortedRows, me]);

  const summary = useMemo(() => {
    const totalRevenue = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_revenue),
      0
    );
    const totalSales = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_sales),
      0
    );
    const totalCalls = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_calls),
      0
    );
    const totalEmails = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_emails),
      0
    );
    const totalLinkedin = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_linkedin),
      0
    );
    const totalMeetings = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_meetings),
      0
    );
    const totalCommissions = rows.reduce(
      (sum, row) => sum + safeNumber(row.metric_commissions_paid_rep),
      0
    );

    return {
      totalRevenue,
      totalSales,
      totalCalls,
      totalEmails,
      totalLinkedin,
      totalMeetings,
      totalCommissions,
      reps: rows.length,
    };
  }, [rows]);

  const rankModeLabel =
    rankMode === "revenue"
      ? "Revenue"
      : rankMode === "commission"
      ? "Commission"
      : "Activity";

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                Sales Leaderboard
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  Automatic
                </span>

                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  {periodType === "monthly" ? "Monthly" : "Weekly"}
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  Rank by {rankModeLabel}
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {rows.length} rep{rows.length === 1 ? "" : "s"}
                </span>

                {myRank ? (
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    Your Rank #{myRank}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Live rep standings based on logged execution, sales, revenue, and commissions.
              </div>

              <div className="mt-2 text-sm text-slate-500">
                Period: {formatPeriodLabel(periodType, periodKey)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={periodType}
                onChange={(e) =>
                  setPeriodType(e.target.value as "weekly" | "monthly")
                }
                className="crm-input px-4 py-2.5"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>

              <input
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                className="crm-input px-4 py-2.5"
                placeholder={periodType === "monthly" ? "YYYY-MM" : "YYYY-W##"}
              />

              <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setRankMode("revenue")}
                  className={`px-4 py-2.5 text-sm font-semibold ${
                    rankMode === "revenue"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                >
                  Revenue
                </button>
                <button
                  type="button"
                  onClick={() => setRankMode("commission")}
                  className={`border-l border-slate-200 px-4 py-2.5 text-sm font-semibold ${
                    rankMode === "commission"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                >
                  Commission
                </button>
                <button
                  type="button"
                  onClick={() => setRankMode("activity")}
                  className={`border-l border-slate-200 px-4 py-2.5 text-sm font-semibold ${
                    rankMode === "activity"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700"
                  }`}
                >
                  Activity
                </button>
              </div>

              <button
                onClick={() => void loadRows()}
                className="crm-button px-5 py-2.5"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-6">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Reps
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.reps}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                           Revenue
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(summary.totalRevenue)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Commissions
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(summary.totalCommissions)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Sales
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.totalSales}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Calls
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.totalCalls}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Meetings
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.totalMeetings}
            </div>
          </div>
        </div>
      </div>

      {myRank && myRow ? (
        <div className="crm-card p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                Your Position
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {formatPeriodLabel(periodType, periodKey)} • Ranked by{" "}
                {rankModeLabel}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="inline-flex rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-2xl font-semibold text-emerald-800">
                #{myRank}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Revenue
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {currency(myRow.metric_revenue)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Commission
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {currency(myRow.metric_commissions_paid_rep)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Activity Score
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {computeActivityScore(myRow)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="crm-card p-6 text-sm text-slate-500">
          Loading leaderboard...
        </div>
      ) : null}

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Rankings
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Automatic standings across sales, revenue, commissions, and execution activity.
            </div>
          </div>

          <div className="text-sm text-slate-500">
            {loading ? "Loading..." : `${sortedRows.length} entries`}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-semibold">Rank</th>
                <th className="py-3 pr-4 font-semibold">Rep</th>
                <th className="py-3 pr-4 font-semibold">Sales</th>
                <th className="py-3 pr-4 font-semibold">Revenue</th>
                <th className="py-3 pr-4 font-semibold">Commission</th>
                <th className="py-3 pr-4 font-semibold">Calls</th>
                <th className="py-3 pr-4 font-semibold">Emails</th>
                <th className="py-3 pr-4 font-semibold">LinkedIn</th>
                <th className="py-3 pr-4 font-semibold">Meetings</th>
                <th className="py-3 pr-4 font-semibold">Conversions</th>
                <th className="py-3 pr-4 font-semibold">Activity Score</th>
                <th className="py-3 pr-4 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-6 text-slate-500">
                    No leaderboard entries for this period.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => {
                  const rank = idx + 1;
                  const isMe = me?.user_id === row.rep_user_id;
                  const activityScore = computeActivityScore(row);

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-200 ${
                        isMe ? "bg-emerald-50/40" : "bg-white"
                      }`}
                    >
                      <td className="py-4 pr-4">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${rankTone(
                            rank
                          )}`}
                        >
                          #{rank}
                        </span>
                      </td>

                      <td className="py-4 pr-4">
                        <div className="font-semibold text-slate-900">
                          {row.rep_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {isMe ? "You" : row.period_key}
                        </div>
                      </td>

                      <td className="py-4 pr-4 text-slate-700">
                        {safeNumber(row.metric_sales)}
                      </td>

                      <td className="py-4 pr-4 font-semibold text-slate-900">
                        {currency(row.metric_revenue)}
                      </td>

                      <td className="py-4 pr-4 font-semibold text-slate-900">
                        {currency(row.metric_commissions_paid_rep)}
                      </td>

                      <td className="py-4 pr-4 text-slate-700">
                        {safeNumber(row.metric_calls)}
                      </td>

                      <td className="py-4 pr-4 text-slate-700">
                        {safeNumber(row.metric_emails)}
                      </td>

                      <td className="py-4 pr-4 text-slate-700">
                        {safeNumber(row.metric_linkedin)}
                      </td>

                      <td className="py-4 pr-4 text-slate-700">
                        {safeNumber(row.metric_meetings)}
                      </td>

                      <td className="py-4 pr-4 text-slate-700">
                        {safeNumber(row.metric_conversions)}
                      </td>

                      <td className="py-4 pr-4 font-semibold text-slate-900">
                        {activityScore}
                      </td>

                      <td className="py-4 pr-4 text-slate-500">
                        {row.notes || "—"}
                      </td>
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