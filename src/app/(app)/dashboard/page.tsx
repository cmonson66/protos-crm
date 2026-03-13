"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { supabase } from "@/lib/supabaseClient";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

type RepLeaderboardRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  calls_today: number;
  emails_today: number;
  meetings_today: number;
  touches_today: number;
  tasks_closed_today: number;
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

function TaskLink({ t }: { t: QueueTask }) {
  return (
    <Link
      href={`/contacts/${t.contact_id}`}
      className="block rounded-xl border p-3 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{fmtContactTitle(t)}</div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {fmtTaskLabel(t)}
          </div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {new Date(t.due_at).toLocaleString()}
        </div>
      </div>
    </Link>
  );
}

function StaleContactLink({ c }: { c: StaleContactRow }) {
  const name = fmtName(c.first_name, c.last_name);
  const title = c.school_name ? `${c.school_name} — ${name}` : name;
  const href = c.id ? `/contacts/${c.id}` : "/contacts";

  return (
    <Link
      href={href}
      className="block rounded-xl border p-3 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{title}</div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {c.sport ?? ""} • {c.status} • {c.cadence_status}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {c.last_activity_at
              ? `Last touch: ${new Date(c.last_activity_at).toLocaleString()}`
              : "Last touch: none"}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const [dueTodayRows, setDueTodayRows] = useState<QueueTask[]>([]);
  const [dueSoonRows, setDueSoonRows] = useState<QueueTask[]>([]);
  const [kpis, setKpis] = useState<TaskKpis | null>(null);
  const [activityKpis, setActivityKpis] = useState<ActivityKpis | null>(null);
  const [cadencePipeline, setCadencePipeline] = useState<CadencePipeline | null>(null);
  const [repLeaderboard, setRepLeaderboard] = useState<RepLeaderboardRow[]>([]);
  const [staleContacts, setStaleContacts] = useState<StaleContactRow[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapRow[]>([]);
  const [priorityContacts, setPriorityContacts] = useState<PriorityContactRow[]>([]);

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

  async function safeJson(res: Response | undefined) {
    if (!res) return {};
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  try {
    const results = await Promise.all([
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
      fetchWithAuth(`/api/dashboard/rep-leaderboard`, {
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
    ]);

    if (loadIdRef.current !== myLoadId) return;

    const dueTodayRes = results[0];
    const dueSoonRes = results[1];
    const kpiRes = results[2];
    const activityRes = results[3];
    const cadenceRes = results[4];
    const leaderboardRes = results[5];
    const staleRes = results[6];
    const heatmapRes = results[7];
    const priorityRes = results[8];

    const dueTodayJson = await safeJson(dueTodayRes);
    const dueSoonJson = await safeJson(dueSoonRes);
    const kpiJson = await safeJson(kpiRes);
    const activityJson = await safeJson(activityRes);
    const cadenceJson = await safeJson(cadenceRes);
    const leaderboardJson = await safeJson(leaderboardRes);
    const staleJson = await safeJson(staleRes);
    const heatmapJson = await safeJson(heatmapRes);
    const priorityJson = await safeJson(priorityRes);

    if (!dueTodayRes?.ok) {
      setErr((dueTodayJson as any)?.error ?? "Failed to load due-today tasks");
      setDueTodayRows([]);
    } else {
      setDueTodayRows((((dueTodayJson as any).data) ?? []) as QueueTask[]);
    }

    if (!dueSoonRes?.ok) {
      setErr((prev) => prev || (dueSoonJson as any)?.error || "Failed to load due-soon tasks");
      setDueSoonRows([]);
    } else {
      setDueSoonRows((((dueSoonJson as any).data) ?? []) as QueueTask[]);
    }

    if (!kpiRes?.ok) {
      setErr((prev) => prev || (kpiJson as any)?.error || "Failed to load task KPIs");
      setKpis(null);
    } else {
      setKpis((((kpiJson as any).data) ?? null) as TaskKpis | null);
    }

    if (!activityRes?.ok) {
      setErr((prev) => prev || (activityJson as any)?.error || "Failed to load activity KPIs");
      setActivityKpis(null);
    } else {
      setActivityKpis((((activityJson as any).data) ?? null) as ActivityKpis | null);
    }

    if (!cadenceRes?.ok) {
      setErr((prev) => prev || (cadenceJson as any)?.error || "Failed to load cadence pipeline");
      setCadencePipeline(null);
    } else {
      setCadencePipeline((((cadenceJson as any).data) ?? null) as CadencePipeline | null);
    }

    if (!leaderboardRes?.ok) {
      setErr((prev) => prev || (leaderboardJson as any)?.error || "Failed to load rep leaderboard");
      setRepLeaderboard([]);
    } else {
      setRepLeaderboard((((leaderboardJson as any).data) ?? []) as RepLeaderboardRow[]);
    }

    if (!staleRes?.ok) {
      setErr((prev) => prev || (staleJson as any)?.error || "Failed to load stale contacts");
      setStaleContacts([]);
    } else {
      setStaleContacts((((staleJson as any).data) ?? []) as StaleContactRow[]);
    }

    if (!heatmapRes?.ok) {
      setErr((prev) => prev || (heatmapJson as any)?.error || "Failed to load activity heatmap");
      setHeatmap([]);
    } else {
      const raw = ((((heatmapJson as any).data) ?? []) as HeatmapRow[]);
      const mapByHour = new Map(raw.map((h) => [Number(h.hour), Number(h.touches)]));
      const fullDay: HeatmapRow[] = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        touches: mapByHour.get(hour) ?? 0,
      }));
      setHeatmap(fullDay);
    }

    if (!priorityRes?.ok) {
      setErr((prev) => prev || (priorityJson as any)?.error || "Failed to load priority contacts");
      setPriorityContacts([]);
    } else {
      setPriorityContacts((((priorityJson as any).data) ?? []) as PriorityContactRow[]);
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

  const firstTask =
    overdueList[0] ||
    dueTodayList[0] ||
    dueSoonRows[0] ||
    null;

  if (firstTask) {
    window.location.assign(`/contacts/${firstTask.contact_id}`);
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
  }, [overdueList, dueTodayList, dueSoonRows, staleContacts]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let t: any = null;

    const scheduleReload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => load(), 1000);
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
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const overdueCount = kpis?.overdue ?? overdueList.length;
  const dueTodayCount = kpis?.due_today ?? dueTodayList.length;
  const dueSoonCount = kpis?.due_soon ?? dueSoonRows.length;
  const closedAllTimeCount = kpis?.closed_all_time ?? 0;
  const maxHeat = Math.max(1, ...heatmap.map((h) => h.touches));
    const pressure = {
    overdue: overdueCount,
    due_today: dueTodayCount,
    due_soon: dueSoonCount,
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          loading
            ? "Loading…"
            : err
            ? err
            : "Work Queue jumps to the next best contact: overdue, due today, due soon, then stale."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button className="rounded-xl" onClick={goToNextWorkItem}>
              Work Queue
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Overdue</div>
            <div className="mt-2 text-3xl font-semibold">{overdueCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Due Today</div>
            <div className="mt-2 text-3xl font-semibold">{dueTodayCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Due Soon ({dueSoonDays}d)</div>
            <div className="mt-2 text-3xl font-semibold">{dueSoonCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Closed (all time)</div>
            <div className="mt-2 text-3xl font-semibold">{closedAllTimeCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Touches Today</div>
            <div className="mt-2 text-3xl font-semibold">
              {activityKpis?.touches_today ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Calls Today</div>
            <div className="mt-2 text-3xl font-semibold">
              {activityKpis?.calls_today ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Emails Today</div>
            <div className="mt-2 text-3xl font-semibold">
              {activityKpis?.emails_today ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Meetings Today</div>
            <div className="mt-2 text-3xl font-semibold">
              {activityKpis?.meetings_today ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Avg Touch Time</div>
            <div className="mt-2 text-3xl font-semibold">
              {fmtDuration(activityKpis?.avg_touch_seconds_today ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Cadence Inactive</div>
            <div className="mt-2 text-3xl font-semibold">
              {cadencePipeline?.inactive ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Active Step 1</div>
            <div className="mt-2 text-3xl font-semibold">
              {cadencePipeline?.step1 ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Active Step 2</div>
            <div className="mt-2 text-3xl font-semibold">
              {cadencePipeline?.step2 ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Active Step 3+</div>
            <div className="mt-2 text-3xl font-semibold">
              {cadencePipeline?.step3plus ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Cadence Completed</div>
            <div className="mt-2 text-3xl font-semibold">
              {cadencePipeline?.completed ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Overdue</div>
              <Badge variant="destructive" className="rounded-xl">
                {overdueList.length}
              </Badge>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : overdueList.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing overdue.</div>
              ) : (
                overdueList.slice(0, 10).map((t) => <TaskLink key={t.task_id} t={t} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Due Today</div>
              <Badge className="rounded-xl">{dueTodayList.length}</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : dueTodayList.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tasks due today.</div>
              ) : (
                dueTodayList.slice(0, 10).map((t) => <TaskLink key={t.task_id} t={t} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Due Soon</div>
              <Badge variant="secondary" className="rounded-xl">
                {dueSoonRows.length}
              </Badge>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : dueSoonRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing due soon.</div>
              ) : (
                dueSoonRows.slice(0, 10).map((t) => <TaskLink key={t.task_id} t={t} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="font-semibold mb-3">Rep Activity Today</div>

            <div className="flex items-end gap-1">
              {heatmap.map((h) => (
                <div key={h.hour} className="flex flex-col items-center gap-1">
                  <div
                    title={`${String(h.hour).padStart(2, "0")}:00 — ${h.touches} touches`}
                    className="w-3 rounded-sm"
                    style={{
                      height: `${Math.max(10, (h.touches / maxHeat) * 60)}px`,
                      opacity: Math.max(0.15, h.touches / maxHeat),
                      backgroundColor: "rgb(79 70 229)",
                    }}
                  />
                  <div className="text-[10px] text-muted-foreground">
                    {h.hour}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="font-semibold">Work Queue Pressure</div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span>Overdue</span>
                  <span className="font-semibold">{pressure.overdue}
</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-red-500"
                    style={{
                      width: `${Math.min(pressure.overdue * 10, 100)}%`,

                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <span>Due Today</span>
                  <span className="font-semibold">{pressure.due_today}</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-amber-500"
                    style={{
                      width: `${Math.min(pressure.due_today * 10, 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm">
                  <span>Due Soon</span>
                  <span className="font-semibold">{pressure.due_soon}</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{
                      width: `${Math.min(pressure.due_soon * 10, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="font-semibold mb-3">High Priority Leads</div>

            <div className="space-y-2">
              {priorityContacts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No priority leads found.</div>
              ) : (
                priorityContacts.map((c) => (
                  <Link
                    key={c.id}
                    href={`/contacts/${c.id}`}
                    className="block rounded-xl border p-3 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {c.school_name ? `${c.school_name} — ` : ""}
                          {fmtName(c.first_name, c.last_name)}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          Tier {c.school_tier} • {c.status} • {c.cadence_status}
                          {c.cadence_step > 0 ? ` • Step ${c.cadence_step}` : ""}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          {daysSince(c.last_activity_at)}
                        </div>

                        <div className="mt-2 text-[11px] text-muted-foreground">
                          RL {c.response_likelihood_score} • Cadence {c.cadence_score} • Recency {c.recency_score} • Tier {c.school_tier_score} • History {c.conversion_history_score}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-full border px-3 py-1 text-sm font-semibold">
                        {c.score}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Rep Leaderboard</div>
              <Badge className="rounded-xl">{repLeaderboard.length}</Badge>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">Rep</th>
                    <th className="py-2">Touches</th>
                    <th className="py-2">Calls</th>
                    <th className="py-2">Emails</th>
                    <th className="py-2">Meetings</th>
                    <th className="py-2">Tasks Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {repLeaderboard.length === 0 ? (
                    <tr>
                      <td className="py-3 text-muted-foreground" colSpan={6}>
                        No rep activity found.
                      </td>
                    </tr>
                  ) : (
                    repLeaderboard.map((r) => (
                      <tr key={r.user_id} className="border-b last:border-b-0">
                        <td className="py-2">
                          <Link
                            href={`/contacts?assigned_to_user_id=${r.user_id}`}
                            className="font-semibold hover:underline"
                          >
                            {r.full_name || r.email || r.user_id}
                          </Link>

                          <div className="text-xs text-muted-foreground">
                            {r.role || ""}
                          </div>
                        </td>
                        <td className="py-2">{r.touches_today}</td>
                        <td className="py-2">{r.calls_today}</td>
                        <td className="py-2">{r.emails_today}</td>
                        <td className="py-2">{r.meetings_today}</td>
                        <td className="py-2">{r.tasks_closed_today}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Stale Contacts</div>
              <Badge variant="secondary" className="rounded-xl">
                {staleContacts.length}
              </Badge>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : staleContacts.length === 0 ? (
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-sm font-semibold">No stale contacts</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Great job — all new contacts have been touched in the last 7 days.
                  </div>
                </div>
              ) : (
                staleContacts.map((c, idx) => (
                  <StaleContactLink
                    key={c.id || `${c.primary_email || "stale"}-${c.last_activity_at || "none"}-${idx}`}
                    c={c}
                  />
                ))
              )}
            </div>

            <div className="mt-4">
              <Link
                href="/contacts"
                className="rounded-xl border px-4 py-2 hover:bg-slate-50 inline-block"
              >
                Open Contacts Command Center
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/tasks"
          className="rounded-xl border px-4 py-2 hover:bg-slate-50"
        >
          View all tasks
        </Link>
        <Link
          href="/contacts"
          className="rounded-xl border px-4 py-2 hover:bg-slate-50"
        >
          Search contacts
        </Link>
      </div>
    </div>
  );
}