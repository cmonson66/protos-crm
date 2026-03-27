"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { supabase } from "@/lib/supabaseClient";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MeResponse = {
  user_id: string;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
};

type QueueTask = {
  task_id: string;
  contact_id: string;
  due_at: string;
  status: string | null;
  cadence_bucket: "OVERDUE" | "DUE_TODAY" | "DUE_SOON";
  task_title: string | null;
  task_type: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_primary_email: string | null;
  school_name: string | null;
  updated_at: string | null;
};

type TaskKpis = {
  overdue: number;
  due_today: number;
  due_soon: number;
  open_total: number;
  closed_all_time: number;
};

type ActivityKpis = {
  touches_today: number;
  calls_today: number;
  emails_today: number;
  meetings_today: number;
  avg_touch_seconds_today: number;
};

type CadencePipeline = {
  inactive: number;
  step1: number;
  step2: number;
  step3plus: number;
  completed: number;
};

type StaleContactRow = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  school_name: string | null;
  sport: string | null;
  status: string;
  cadence_status: string;
  assigned_to_user_id: string | null;
  last_activity_at: string | null;
  updated_at: string | null;
};

type HeatmapRow = {
  hour: number;
  touches: number;
};

type PriorityContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  school_name: string | null;
  school_tier: number;
  status: string;
  cadence_status: string;
  cadence_step: number;
  last_activity_at: string | null;
  score: number;
  response_likelihood_score: number;
  cadence_score: number;
  recency_score: number;
  school_tier_score: number;
  conversion_history_score: number;
};

type OpportunityRevenueBucket = {
  discovery_weighted: number;
  presentation_weighted: number;
  total_pipeline_weighted: number;
  closed_actual: number;
  new_opportunities: number;
  qualified_meetings: number;
};

type OpportunityConversions = {
  prospecting_count: number;
  discovery_count: number;
  presentation_count: number;
  contract_signed_count: number;
  prospecting_to_discovery: number;
  discovery_to_presentation: number;
  presentation_to_close: number;
};

type OpportunitySalesVelocity = {
  open_opportunities: number;
  avg_deal_size: number;
  close_rate: number;
  sales_cycle_days: number;
  sales_velocity: number;
};

type OpportunitySummaryResponse = {
  ytd: OpportunityRevenueBucket | null;
  quarter: OpportunityRevenueBucket | null;
  month: OpportunityRevenueBucket | null;
  conversions: OpportunityConversions | null;
  sales_velocity: OpportunitySalesVelocity | null;
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
  metric_emails: number;
  metric_linkedin: number;
  metric_meetings: number;
  metric_conversions: number;
  metric_commissions_paid: number;
  activity_score: number;
  rank_override: number | null;
  notes: string | null;
  updated_at: string;
  rank?: number;
};

type RankMode =
  | "activity_score"
  | "metric_revenue"
  | "metric_commissions_paid";

type RecentWinRow = {
  id: string;
  kind: "closed_won" | "meeting_booked" | "reply";
  ts: string;
  title: string;
  subtitle: string | null;
  href: string;
  amount: number | null;
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
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function sortLeaderboard(rows: LeaderboardRow[], rankMode: RankMode) {
  const out = [...rows];
  out.sort((a, b) => {
    const metric = (row: LeaderboardRow) => {
      switch (rankMode) {
        case "metric_revenue":
          return Number(row.metric_revenue || 0);
        case "metric_commissions_paid":
          return Number(row.metric_commissions_paid || 0);
        case "activity_score":
        default:
          return Number(row.activity_score || 0);
      }
    };

    const diff = metric(b) - metric(a);
    if (diff !== 0) return diff;

    if (Number(b.metric_sales || 0) !== Number(a.metric_sales || 0)) {
      return Number(b.metric_sales || 0) - Number(a.metric_sales || 0);
    }

    if (Number(b.metric_revenue || 0) !== Number(a.metric_revenue || 0)) {
      return Number(b.metric_revenue || 0) - Number(a.metric_revenue || 0);
    }

    return a.rep_name.localeCompare(b.rep_name);
  });

  return out.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function fmtName(fn?: string | null, ln?: string | null) {
  const name = `${fn ?? ""} ${ln ?? ""}`.trim();
  return name || "(No name)";
}

function fmtContactTitle(t: QueueTask) {
  const name = fmtName(t.contact_first_name, t.contact_last_name);
  return t.school_name ? `${t.school_name} — ${name}` : name;
}

function fmtTaskLabel(t: QueueTask) {
  return (t.task_title || "").trim() || (t.task_type || "").trim() || "Task";
}

function fmtDuration(seconds: number) {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function daysSince(ts: string | null) {
  if (!ts) return "Never touched";
  const d = new Date(ts).getTime();
  const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

function currency(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function percent(n: number | null | undefined) {
  return `${Math.round(Number(n || 0) * 100)}%`;
}

function numberFmt(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(Number(n || 0));
}

function roleScopeLabel(role: MeResponse["role"] | null) {
  return role === "rep" ? "Your" : "Team";
}

function rankModeLabel(mode: RankMode) {
  switch (mode) {
    case "metric_revenue":
      return "Revenue";
    case "metric_commissions_paid":
      return "Commission Paid";
    case "activity_score":
    default:
      return "Activity Score";
  }
}

function KpiCard({
  label,
  value,
  href,
  accent = "orange",
  sublabel,
}: {
  label: string;
  value: string | number;
  href: string;
  accent?: "orange" | "sky" | "emerald" | "violet" | "slate";
  sublabel?: string;
}) {
  const accentTone =
    accent === "sky"
      ? "from-sky-50 to-white border-sky-100"
      : accent === "emerald"
        ? "from-emerald-50 to-white border-emerald-100"
        : accent === "violet"
          ? "from-violet-50 to-white border-violet-100"
          : accent === "slate"
            ? "from-slate-50 to-white border-slate-100"
            : "from-orange-50 to-white border-orange-100";

  return (
    <Link href={href} className="h-full">
      <Card
        className={`h-full rounded-3xl border bg-gradient-to-br ${accentTone} shadow-none transition hover:-translate-y-[1px] hover:shadow-sm`}
      >
        <CardContent className="flex min-h-[192px] h-full flex-col justify-between p-5">
          <div className="min-h-[56px] text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </div>
          <div className="text-3xl font-semibold tracking-tight text-slate-900">
            {value}
          </div>
          <div className="pt-3 text-xs text-slate-500">{sublabel || "Open"}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionCard({
  title,
  right,
  children,
  dark = false,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <Card
      className={
        dark
          ? "rounded-3xl border-0 bg-slate-900 text-white shadow-none"
          : "crm-card rounded-3xl border-0 shadow-none"
      }
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className={dark ? "text-lg font-semibold text-white" : "text-lg font-semibold"}>
            {title}
          </div>
          {right}
        </div>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "orange" | "emerald" | "sky" | "violet";
}) {
  const toneClass =
    tone === "orange"
      ? "border-orange-100 bg-orange-50"
      : tone === "emerald"
        ? "border-emerald-100 bg-emerald-50"
        : tone === "sky"
          ? "border-sky-100 bg-sky-50"
          : tone === "violet"
            ? "border-violet-100 bg-violet-50"
            : "border-slate-100 bg-slate-50";

  return (
    <div className={`rounded-2xl border ${toneClass} p-4`}>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function PriorityRow({ c }: { c: PriorityContactRow }) {
  return (
    <Link
      href={`/contacts/${c.id}`}
      className="block rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-[1px] hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">
            {c.school_name ? `${c.school_name} — ` : ""}
            {fmtName(c.first_name, c.last_name)}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Score drivers • RL {c.response_likelihood_score} • Cadence {c.cadence_score} •
            Recency {c.recency_score}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            {c.status} • {c.cadence_status}
            {c.cadence_step > 0 ? ` • Step ${c.cadence_step}` : ""} • {daysSince(c.last_activity_at)}
          </div>
        </div>

        <div className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-800">
          {c.score}
        </div>
      </div>
    </Link>
  );
}

function StaleContactRowCard({ c }: { c: StaleContactRow }) {
  const title = c.school_name
    ? `${c.school_name} — ${fmtName(c.first_name, c.last_name)}`
    : fmtName(c.first_name, c.last_name);

  return (
    <Link
      href={c.id ? `/contacts/${c.id}` : "/contacts"}
      className="block rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-[1px] hover:bg-slate-50"
    >
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-500">
        {c.status} • {c.cadence_status}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {c.last_activity_at
          ? `Last touch: ${new Date(c.last_activity_at).toLocaleString()}`
          : "Last touch: none"}
      </div>
    </Link>
  );
}

function RecentWinRowCard({ row }: { row: RecentWinRow }) {
  const tone =
    row.kind === "closed_won"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : row.kind === "meeting_booked"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-violet-200 bg-violet-50 text-violet-700";

  const label =
    row.kind === "closed_won"
      ? "Closed Won"
      : row.kind === "meeting_booked"
        ? "Meeting Booked"
        : "Reply";

  return (
    <Link
      href={row.href}
      className="block rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-[1px] hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
              {label}
            </span>
          </div>

          <div className="mt-2 font-semibold text-slate-900">{row.title}</div>

          {row.subtitle ? (
            <div className="mt-1 text-sm text-slate-600">{row.subtitle}</div>
          ) : null}

          <div className="mt-1 text-xs text-slate-500">
            {new Date(row.ts).toLocaleString()}
          </div>
        </div>

        {row.amount != null ? (
          <div className="shrink-0 text-sm font-semibold text-emerald-700">
            {currency(row.amount)}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  const [dueTodayRows, setDueTodayRows] = useState<QueueTask[]>([]);
  const [dueSoonRows, setDueSoonRows] = useState<QueueTask[]>([]);
  const [kpis, setKpis] = useState<TaskKpis | null>(null);
  const [activityKpis, setActivityKpis] = useState<ActivityKpis | null>(null);
  const [cadencePipeline, setCadencePipeline] = useState<CadencePipeline | null>(null);
  const [staleContacts, setStaleContacts] = useState<StaleContactRow[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapRow[]>([]);
  const [priorityContacts, setPriorityContacts] = useState<PriorityContactRow[]>([]);
  const [opportunitySummary, setOpportunitySummary] =
    useState<OpportunitySummaryResponse | null>(null);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<LeaderboardRow[]>([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardRow[]>([]);
  const [recentWins, setRecentWins] = useState<RecentWinRow[]>([]);
  const [leaderboardMode, setLeaderboardMode] =
    useState<RankMode>("activity_score");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const tz = "America/Phoenix";
  const dueSoonDays = 3;

  const abortRef = useRef<AbortController | null>(null);
  const loadIdRef = useRef(0);

  async function load() {
    const myLoadId = ++loadIdRef.current;

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setErr(null);
    setLoading(true);

    try {
      const [
        meRes,
        dueTodayRes,
        dueSoonRes,
        kpiRes,
        activityRes,
        cadenceRes,
        staleRes,
        heatmapRes,
        priorityRes,
        opportunitySummaryRes,
        weeklyLeaderboardRes,
        monthlyLeaderboardRes,
        recentWinsRes,
      ] = await Promise.all([
        fetchWithAuth("/api/auth/me", { signal: ac.signal }),
        fetchWithAuth(`/api/tasks/due-today?tz=${encodeURIComponent(tz)}`, {
          signal: ac.signal,
        }),
        fetchWithAuth(
          `/api/tasks/due-soon?tz=${encodeURIComponent(tz)}&days=${dueSoonDays}`,
          { signal: ac.signal }
        ),
        fetchWithAuth(
          `/api/dashboard/task-kpis?tz=${encodeURIComponent(
            tz
          )}&dueSoonDays=${dueSoonDays}`,
          { signal: ac.signal }
        ),
        fetchWithAuth(`/api/dashboard/activity-kpis?tz=${encodeURIComponent(tz)}`, {
          signal: ac.signal,
        }),
        fetchWithAuth(`/api/dashboard/cadence-pipeline`, {
          signal: ac.signal,
        }),
        fetchWithAuth(`/api/dashboard/stale-contacts`, {
          signal: ac.signal,
        }),
        fetchWithAuth(`/api/dashboard/activity-heatmap`, {
          signal: ac.signal,
        }),
        fetchWithAuth(`/api/dashboard/priority-contacts`, {
          signal: ac.signal,
        }),
        fetchWithAuth(`/api/dashboard/opportunity-summary`, {
          signal: ac.signal,
        }),
        fetchWithAuth(
          `/api/leaderboard/list?period_type=weekly&period_key=${encodeURIComponent(
            currentWeekKey()
          )}`,
          { signal: ac.signal }
        ),
        fetchWithAuth(
          `/api/leaderboard/list?period_type=monthly&period_key=${encodeURIComponent(
            currentMonthKey()
          )}`,
          { signal: ac.signal }
        ),
        fetchWithAuth(`/api/dashboard/recent-wins`, {
          signal: ac.signal,
        }),
      ]);

      if (loadIdRef.current !== myLoadId) return;

      const meJson = await meRes.json().catch(() => ({}));
      const dueTodayJson = await dueTodayRes.json().catch(() => ({}));
      const dueSoonJson = await dueSoonRes.json().catch(() => ({}));
      const kpiJson = await kpiRes.json().catch(() => ({}));
      const activityJson = await activityRes.json().catch(() => ({}));
      const cadenceJson = await cadenceRes.json().catch(() => ({}));
      const staleJson = await staleRes.json().catch(() => ({}));
      const heatmapJson = await heatmapRes.json().catch(() => ({}));
      const priorityJson = await priorityRes.json().catch(() => ({}));
      const opportunitySummaryJson = await opportunitySummaryRes.json().catch(() => ({}));
      const weeklyLeaderboardJson = await weeklyLeaderboardRes.json().catch(() => ({}));
      const monthlyLeaderboardJson = await monthlyLeaderboardRes.json().catch(() => ({}));
      const recentWinsJson = await recentWinsRes.json().catch(() => ({}));

      if (meRes.ok) setMe(meJson as MeResponse);
      else setMe(null);

      if (!dueTodayRes.ok) {
        setErr(dueTodayJson?.error ?? "Failed to load due-today tasks");
        setDueTodayRows([]);
      } else {
        setDueTodayRows((dueTodayJson.data ?? []) as QueueTask[]);
      }

      if (!dueSoonRes.ok) {
        setErr((prev) => prev || dueSoonJson?.error || "Failed to load due-soon tasks");
        setDueSoonRows([]);
      } else {
        setDueSoonRows((dueSoonJson.data ?? []) as QueueTask[]);
      }

      if (!kpiRes.ok) {
        setErr((prev) => prev || kpiJson?.error || "Failed to load task KPIs");
        setKpis(null);
      } else {
        setKpis((kpiJson.data ?? null) as TaskKpis | null);
      }

      if (!activityRes.ok) {
        setErr((prev) => prev || activityJson?.error || "Failed to load activity KPIs");
        setActivityKpis(null);
      } else {
        setActivityKpis((activityJson.data ?? null) as ActivityKpis | null);
      }

      if (!cadenceRes.ok) {
        setErr((prev) => prev || cadenceJson?.error || "Failed to load cadence pipeline");
        setCadencePipeline(null);
      } else {
        setCadencePipeline((cadenceJson.data ?? null) as CadencePipeline | null);
      }

      if (!staleRes.ok) {
        setErr((prev) => prev || staleJson?.error || "Failed to load stale contacts");
        setStaleContacts([]);
      } else {
        setStaleContacts((staleJson.data ?? []) as StaleContactRow[]);
      }

      if (!heatmapRes.ok) {
        setErr((prev) => prev || heatmapJson?.error || "Failed to load activity heatmap");
        setHeatmap([]);
      } else {
        const raw = (heatmapJson.data ?? []) as HeatmapRow[];
        const mapByHour = new Map(raw.map((h) => [Number(h.hour), Number(h.touches)]));
        const fullDay: HeatmapRow[] = Array.from({ length: 24 }, (_, hour) => ({
          hour,
          touches: mapByHour.get(hour) ?? 0,
        }));
        setHeatmap(fullDay);
      }

      if (!priorityRes.ok) {
        setErr((prev) => prev || priorityJson?.error || "Failed to load priority contacts");
        setPriorityContacts([]);
      } else {
        setPriorityContacts((priorityJson.data ?? []) as PriorityContactRow[]);
      }

      if (!opportunitySummaryRes.ok) {
        setErr(
          (prev) => prev || opportunitySummaryJson?.error || "Failed to load opportunity summary"
        );
        setOpportunitySummary(null);
      } else {
        setOpportunitySummary(
          (opportunitySummaryJson.data ?? null) as OpportunitySummaryResponse | null
        );
      }

      if (!weeklyLeaderboardRes.ok) {
        setErr((prev) => prev || weeklyLeaderboardJson?.error || "Failed to load weekly leaderboard");
        setWeeklyLeaderboard([]);
      } else {
        setWeeklyLeaderboard((weeklyLeaderboardJson.data ?? []) as LeaderboardRow[]);
      }

      if (!monthlyLeaderboardRes.ok) {
        setErr((prev) => prev || monthlyLeaderboardJson?.error || "Failed to load monthly leaderboard");
        setMonthlyLeaderboard([]);
      } else {
        setMonthlyLeaderboard((monthlyLeaderboardJson.data ?? []) as LeaderboardRow[]);
      }

      if (!recentWinsRes.ok) {
        setRecentWins([]);
      } else {
        setRecentWins((recentWinsJson.data ?? []) as RecentWinRow[]);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setErr(e?.message || "Failed to load dashboard");
      }
    } finally {
      if (loadIdRef.current === myLoadId) setLoading(false);
    }
  }

  const { overdueList, dueTodayList } = useMemo(() => {
    const overdueList = dueTodayRows.filter((r) => r.cadence_bucket === "OVERDUE");
    const dueTodayList = dueTodayRows.filter((r) => r.cadence_bucket === "DUE_TODAY");
    return { overdueList, dueTodayList };
  }, [dueTodayRows]);

  async function goToNextWorkItem() {
    try {
      const res = await fetchWithAuth("/api/work-queue/next");
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.data?.contact_id) {
        window.location.assign(`/contacts/${json.data.contact_id}`);
        return;
      }
    } catch {}

    const firstTask = overdueList[0] || dueTodayList[0] || dueSoonRows[0] || null;

    if (firstTask) {
      window.location.assign(`/contacts/${firstTask.contact_id}`);
      return;
    }

    const firstPriority = priorityContacts[0] || null;
    if (firstPriority?.id) {
      window.location.assign(`/contacts/${firstPriority.id}`);
      return;
    }

    const firstStale = staleContacts[0] || null;
    if (firstStale?.id) {
      window.location.assign(`/contacts/${firstStale.id}`);
      return;
    }

    window.location.assign("/contacts");
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "w") {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          (document.activeElement as any)?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        goToNextWorkItem();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [overdueList, dueTodayList, dueSoonRows, priorityContacts, staleContacts]);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let t: any = null;

    const scheduleReload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(), 900);
    };

    const channel = supabase
      .channel("rt-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activities" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "activities" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "opportunities" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "opportunities" },
        scheduleReload
      )
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const scopeLabel = roleScopeLabel(me?.role ?? null);
  const overdueCount = kpis?.overdue ?? overdueList.length;
  const dueTodayCount = kpis?.due_today ?? dueTodayList.length;
  const dueSoonCount = kpis?.due_soon ?? dueSoonRows.length;
  const urgentContactsCount = priorityContacts.length;
  const staleContactsCount = staleContacts.length;
  const backlogCount = overdueCount + dueTodayCount + dueSoonCount + staleContactsCount;

  const weeklySummary = useMemo(() => {
    return weeklyLeaderboard.reduce(
      (acc, row) => {
        acc.meetings += Number(row.metric_meetings || 0);
        return acc;
      },
      { meetings: 0 }
    );
  }, [weeklyLeaderboard]);

  const monthlySummary = useMemo(() => {
    return monthlyLeaderboard.reduce(
      (acc, row) => {
        acc.sales += Number(row.metric_sales || 0);
        acc.revenue += Number(row.metric_revenue || 0);
        acc.commissions += Number(row.metric_commissions_paid || 0);
        return acc;
      },
      { sales: 0, revenue: 0, commissions: 0 }
    );
  }, [monthlyLeaderboard]);

  const rankedLeaderboard = useMemo(() => {
    return sortLeaderboard(monthlyLeaderboard, leaderboardMode);
  }, [monthlyLeaderboard, leaderboardMode]);

  const topFiveLeaderboard = rankedLeaderboard.slice(0, 5);

  const myLeaderboardRow = useMemo(() => {
    if (!me?.user_id) return null;
    return rankedLeaderboard.find((r) => r.rep_user_id === me.user_id) || null;
  }, [rankedLeaderboard, me]);

  const topRep = rankedLeaderboard[0] || null;

  const nextTask = overdueList[0] || dueTodayList[0] || dueSoonRows[0] || null;
  const nextContact = priorityContacts[0] || null;

  const maxHeat = Math.max(1, ...heatmap.map((h) => h.touches));

  const controlCenterTitle =
    me?.role === "rep" ? "Today’s Control Center" : "Team Control Center";

  const leaderboardPanelTitle =
    me?.role === "rep" ? "Leaderboard Snapshot" : "Team Leaderboard";

  const repEfficiency = useMemo(() => {
    const calls = activityKpis?.calls_today ?? 0;
    const emails = activityKpis?.emails_today ?? 0;
    const meetings = activityKpis?.meetings_today ?? 0;
    const touches = activityKpis?.touches_today ?? 0;
    const touchTime = activityKpis?.avg_touch_seconds_today ?? 0;

    return {
      calls,
      emails,
      meetings,
      touches,
      touchTime,
    };
  }, [activityKpis]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle={
          loading
            ? "Loading live operating view..."
            : err
              ? err
              : me?.role === "rep"
                ? "Your daily command dashboard for execution, conversion, and momentum."
                : "Live team operating view across execution, conversion, and coaching."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              className="crm-button-primary rounded-xl border-0"
              onClick={goToNextWorkItem}
            >
              Work Queue
            </Button>
            <Button
              variant="outline"
              className="crm-button rounded-xl border-0"
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label={`${scopeLabel} Open Tasks Due Today`}
          value={dueTodayCount}
          href="/tasks"
          accent="orange"
          sublabel="Open the task queue"
        />
        <KpiCard
          label={`${scopeLabel} Contacts Due Now`}
          value={urgentContactsCount}
          href="/work-queue"
          accent="sky"
          sublabel="Combined urgency bucket"
        />
        <KpiCard
          label={`${scopeLabel} Meetings This Week`}
          value={weeklySummary.meetings}
          href="/leaderboard"
          accent="violet"
          sublabel="Weekly leaderboard meetings"
        />
        <KpiCard
          label={`${scopeLabel} Sales This Month`}
          value={monthlySummary.sales}
          href="/opportunities"
          accent="emerald"
          sublabel="Closed won count"
        />
        <KpiCard
          label={`${scopeLabel} Revenue This Month`}
          value={currency(monthlySummary.revenue)}
          href="/opportunities"
          accent="orange"
          sublabel="Closed won revenue"
        />
        <KpiCard
          label={`${scopeLabel} Commission Paid This Month`}
          value={currency(monthlySummary.commissions)}
          href="/leaderboard"
          accent="slate"
          sublabel="Paid rep commissions"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <SectionCard
          title={controlCenterTitle}
          right={
            <Badge className="rounded-xl bg-white text-slate-700 hover:bg-white">
              Queue backlog {backlogCount}
            </Badge>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {me?.role === "rep" ? "My Next Contact" : "Highest Priority Contact"}
                </div>
                {!nextContact ? (
                  <div className="mt-3 text-sm text-slate-500">No urgent contact surfaced.</div>
                ) : (
                  <>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {nextContact.school_name ? `${nextContact.school_name} — ` : ""}
                      {fmtName(nextContact.first_name, nextContact.last_name)}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Score {nextContact.score} • {nextContact.status} •{" "}
                      {nextContact.cadence_status}
                      {nextContact.cadence_step > 0 ? ` • Step ${nextContact.cadence_step}` : ""}
                    </div>
                    <div className="mt-3">
                      <Link href={`/contacts/${nextContact.id}`} className="crm-button inline-block px-4 py-2">
                        Open Contact
                      </Link>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {me?.role === "rep" ? "My Next Task" : "Next Team Task"}
                </div>
                {!nextTask ? (
                  <div className="mt-3 text-sm text-slate-500">No open task surfaced.</div>
                ) : (
                  <>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {fmtTaskLabel(nextTask)}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {fmtContactTitle(nextTask)} • {new Date(nextTask.due_at).toLocaleString()}
                    </div>
                    <div className="mt-3">
                      <Link
                        href={`/contacts/${nextTask.contact_id}`}
                        className="crm-button inline-block px-4 py-2"
                      >
                        Open Task Contact
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniStat label="Overdue" value={overdueCount} tone="orange" />
                <MiniStat label="Urgent Contacts" value={urgentContactsCount} tone="sky" />
                <MiniStat label="No Touch 7+ Days" value={staleContactsCount} tone="violet" />
                <MiniStat label="Due Soon" value={dueSoonCount} tone="slate" />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {me?.role === "rep" ? "Current Leaderboard Position" : "Top Rep Right Now"}
                </div>

                {me?.role === "rep" ? (
                  myLeaderboardRow ? (
                    <>
                      <div className="mt-2 text-3xl font-semibold text-slate-900">
                        #{myLeaderboardRow.rank}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Ranked by {rankModeLabel(leaderboardMode)} •{" "}
                        {rankModeLabel(leaderboardMode) === "Revenue"
                          ? currency(myLeaderboardRow.metric_revenue)
                          : rankModeLabel(leaderboardMode) === "Commission Paid"
                            ? currency(myLeaderboardRow.metric_commissions_paid)
                            : numberFmt(myLeaderboardRow.activity_score)}
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">No current rank available.</div>
                  )
                ) : topRep ? (
                  <>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      {topRep.rep_name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      #{topRep.rank} • {rankModeLabel(leaderboardMode)} •{" "}
                      {leaderboardMode === "metric_revenue"
                        ? currency(topRep.metric_revenue)
                        : leaderboardMode === "metric_commissions_paid"
                          ? currency(topRep.metric_commissions_paid)
                          : numberFmt(topRep.activity_score)}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-slate-500">No leaderboard data.</div>
                )}

                <div className="mt-3">
                  <Link href="/leaderboard" className="crm-button inline-block px-4 py-2">
                    Open Leaderboard
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={leaderboardPanelTitle}
          dark
          right={
            <div className="flex items-center gap-2">
              <select
                value={leaderboardMode}
                onChange={(e) => setLeaderboardMode(e.target.value as RankMode)}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="activity_score" className="text-slate-900">
                  Activity
                </option>
                <option value="metric_revenue" className="text-slate-900">
                  Revenue
                </option>
                <option value="metric_commissions_paid" className="text-slate-900">
                  Commission
                </option>
              </select>
            </div>
          }
        >
          <div className="space-y-3">
            {topFiveLeaderboard.length === 0 ? (
              <div className="text-sm text-slate-300">No leaderboard data available.</div>
            ) : (
              topFiveLeaderboard.map((row) => {
                const isMe = me?.user_id === row.rep_user_id;
                const metricValue =
                  leaderboardMode === "metric_revenue"
                    ? currency(row.metric_revenue)
                    : leaderboardMode === "metric_commissions_paid"
                      ? currency(row.metric_commissions_paid)
                      : numberFmt(row.activity_score);

                return (
                  <Link
                    key={row.id}
                    href="/leaderboard"
                    className={`block rounded-2xl border px-4 py-3 transition hover:bg-white/10 ${
                      isMe
                        ? "border-emerald-300/40 bg-emerald-400/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                            #{row.rank}
                          </span>
                          <span className="truncate font-semibold text-white">
                            {row.rep_name}
                            {isMe ? " • You" : ""}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-300">
                          Sales {row.metric_sales} • Meetings {row.metric_meetings} • Revenue{" "}
                          {currency(row.metric_revenue)}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-white">
                        {metricValue}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Execution Health">
          <div className="grid gap-3 md:grid-cols-2">
            <MiniStat label="Overdue Work" value={overdueCount} tone="orange" />
            <MiniStat label="Due Today" value={dueTodayCount} tone="sky" />
            <MiniStat label="Urgent Contacts" value={urgentContactsCount} tone="violet" />
            <MiniStat label="No Touch 7+ Days" value={staleContactsCount} tone="slate" />
            <MiniStat label="Cadence Inactive" value={cadencePipeline?.inactive ?? 0} tone="slate" />
            <MiniStat label="Cadence Step 3+" value={cadencePipeline?.step3plus ?? 0} tone="emerald" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/work-queue" className="crm-button inline-block px-4 py-2">
              Open Execution Queue
            </Link>
            <Link href="/contacts" className="crm-button inline-block px-4 py-2">
              Open Contacts
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Pipeline Funnel">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MiniStat
              label="Prospecting"
              value={opportunitySummary?.conversions?.prospecting_count ?? 0}
              tone="slate"
            />
            <MiniStat
              label="Discovery"
              value={opportunitySummary?.conversions?.discovery_count ?? 0}
              tone="sky"
            />
            <MiniStat
              label="Presentation"
              value={opportunitySummary?.conversions?.presentation_count ?? 0}
              tone="violet"
            />
            <MiniStat
              label="Contract Signed"
              value={opportunitySummary?.conversions?.contract_signed_count ?? 0}
              tone="emerald"
            />
            <MiniStat
              label="Closed Revenue"
              value={currency(opportunitySummary?.month?.closed_actual)}
              tone="orange"
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Prospect → Discovery
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {percent(opportunitySummary?.conversions?.prospecting_to_discovery)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Discovery → Presentation
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {percent(opportunitySummary?.conversions?.discovery_to_presentation)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Presentation → Close
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {percent(opportunitySummary?.conversions?.presentation_to_close)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/opportunities" className="crm-button inline-block px-4 py-2">
              Open Opportunities
            </Link>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Activity Rhythm">
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <MiniStat label="Touches Today" value={activityKpis?.touches_today ?? 0} tone="slate" />
            <MiniStat label="Calls Today" value={activityKpis?.calls_today ?? 0} tone="sky" />
            <MiniStat label="Emails Today" value={activityKpis?.emails_today ?? 0} tone="violet" />
            <MiniStat label="Avg Touch" value={fmtDuration(activityKpis?.avg_touch_seconds_today ?? 0)} tone="orange" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-900">
              Intraday activity pattern
            </div>

            <div className="flex items-end gap-1 overflow-x-auto">
              {heatmap.map((h) => (
                <div key={h.hour} className="flex min-w-[16px] flex-col items-center gap-1">
                  <div
                    title={`${String(h.hour).padStart(2, "0")}:00 — ${h.touches} touches`}
                    className="w-4 rounded-sm bg-orange-500/80"
                    style={{
                      height: `${Math.max(10, (h.touches / maxHeat) * 88)}px`,
                      opacity: Math.max(0.2, h.touches / maxHeat),
                    }}
                  />
                  <div className="text-[10px] text-slate-500">{h.hour}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Needs Attention Now"
          right={
            <Badge className="rounded-xl bg-white text-slate-700 hover:bg-white">
              {priorityContacts.length}
            </Badge>
          }
        >
          <div className="space-y-3">
            {priorityContacts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                No urgent contacts surfaced right now.
              </div>
            ) : (
              priorityContacts.slice(0, 8).map((c) => <PriorityRow key={c.id} c={c} />)
            )}
          </div>

          <div className="mt-4">
            <Link href="/work-queue" className="crm-button inline-block px-4 py-2">
              Open Execution Queue
            </Link>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Recent Wins"
          right={
            <Badge className="rounded-xl bg-white text-slate-700 hover:bg-white">
              {recentWins.length}
            </Badge>
          }
        >
          <div className="space-y-3">
            {recentWins.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                No recent wins yet.
              </div>
            ) : (
              recentWins.slice(0, 6).map((row) => (
                <RecentWinRowCard key={row.id} row={row} />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title={me?.role === "rep" ? "My Efficiency" : "Coaching Signals"}
        >
          {me?.role === "rep" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <MiniStat label="Touches Today" value={repEfficiency.touches} tone="slate" />
              <MiniStat label="Calls Today" value={repEfficiency.calls} tone="sky" />
              <MiniStat label="Emails Today" value={repEfficiency.emails} tone="violet" />
              <MiniStat label="Meetings Today" value={repEfficiency.meetings} tone="emerald" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <MiniStat label="Urgent Contacts" value={urgentContactsCount} tone="orange" />
              <MiniStat label="No Touch 7+ Days" value={staleContactsCount} tone="violet" />
              <MiniStat label="Open Opportunities" value={opportunitySummary?.sales_velocity?.open_opportunities ?? 0} tone="sky" />
              <MiniStat label="Close Rate" value={percent(opportunitySummary?.sales_velocity?.close_rate)} tone="emerald" />
            </div>
          )}

          <div className="mt-4 text-sm text-slate-600">
            {me?.role === "rep"
              ? "Use this to stay consistent on daily execution."
              : "Use this to spot coaching needs and execution gaps early."}
          </div>
        </SectionCard>

        <SectionCard
          title={me?.role === "rep" ? "Stale Contacts" : "Risk Contacts"}
          right={
            <Badge variant="secondary" className="rounded-xl">
              {staleContacts.length}
            </Badge>
          }
        >
          <div className="space-y-3">
            {staleContacts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  No stale contacts
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Great job — nothing is sitting untouched for 7+ days.
                </div>
              </div>
            ) : (
              staleContacts.slice(0, 6).map((c, idx) => (
                <StaleContactRowCard
                  key={c.id || `${c.primary_email || "stale"}-${idx}`}
                  c={c}
                />
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/work" className="crm-button px-4 py-2">
          Open Work Queue
        </Link>
        <Link href="/work-queue" className="crm-button px-4 py-2">
          Open Execution Queue
        </Link>
        <Link href="/contacts" className="crm-button px-4 py-2">
          Search Contacts
        </Link>
        <Link href="/opportunities" className="crm-button px-4 py-2">
          Open Opportunities
        </Link>
        <Link href="/leaderboard" className="crm-button px-4 py-2">
          Open Leaderboard
        </Link>
      </div>
    </div>
  );
}