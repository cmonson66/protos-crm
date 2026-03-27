"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { supabase } from "@/lib/supabaseClient";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Vertical = "athletics" | "corporate";

type TaskRow = {
  id: string;
  due_at: string;
  title: string | null;
  notes: string | null;
  task_type: string;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  contact_id: string;
  assigned_to_user_id?: string | null;
  owner_user_id?: string | null;
  contacts: {
    id: string;
    vertical: Vertical;
    first_name: string | null;
    last_name: string | null;
    primary_email: string | null;
    job_title_raw: string | null;
    sport: string;
    schools: { name: string } | null;
    accounts: { name: string } | null;
  } | null;
};

type RowDetailsResponse = {
  contact: {
    id: string;
    full_name: string;
    school_name: string | null;
    account_name?: string | null;
    org_name?: string | null;
    vertical?: Vertical | null;
    sport: string | null;
    status: string;
    cadence_key: string | null;
    cadence_step: number | null;
    cadence_status: string | null;
    cadence_next_due_at: string | null;
    priority_score: number;
    school_tier: number | null;
  };
  lastActivity: {
    id: string;
    type: string;
    occurred_at: string;
    subject: string | null;
    body: string | null;
    outcome: string | null;
  } | null;
  priorityBreakdown: { label: string; points: number }[];
  cadencePreview: {
    cadence_key: string;
    step: number;
    subject: string | null;
    body: string | null;
    due_offset_days: number | null;
  } | null;
  nextBestAction: {
    kind:
      | "open_contact"
      | "start_cadence"
      | "restart_cadence"
      | "open_cadence_step"
      | "change_status";
    label: string;
  } | null;
  notes: {
    id: string;
    body: string;
    occurred_at: string;
    created_at?: string | null;
  }[];
};

type RadarContact = {
  id: string;
  vertical: Vertical;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  sport: string;
  status: string | null;
  cadence_status: string | null;
  cadence_step: number;
  school_name: string | null;
  account_name: string | null;
  org_name: string | null;
  assigned_to_user_id: string | null;
  last_activity_at: string | null;
  updated_at: string | null;
  school_tier: number | null;
  priority_score: number;
  momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
  momentum_score: number;
  priority_reason: string;
};

type RadarResponse = {
  data: RadarContact[];
  count: number;
};

type QueueAnalyticsResponse = {
  window_days: number;
  total_completed: number;
  completed_today: number;
  avg_touch_seconds: number;
  complete_touch_count: number;
  snooze_count: number;
  skip_count: number;
  promoted_contacts_completed: number;
  radar_promotion_completion_rate: number;
  cadence_completion_rate: number;
  snooze_rate: number;
  manager_mode: boolean;
  sources: {
    key: "radar_promotion" | "cadence" | "manual_follow_up" | "due_task";
    label: string;
    count: number;
  }[];
};

type QueueReason = {
  type: "task_due" | "radar_promotion" | "cadence" | "manual_follow_up";
  label: string;
  detail: string;
};

const BTN = "crm-button rounded-xl px-4 py-2 text-sm";
const BTN_PRIMARY = "crm-button-primary rounded-xl px-4 py-2 text-sm";
const PILL = "crm-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";

function fmtName(fn?: string | null, ln?: string | null) {
  const n = `${fn ?? ""} ${ln ?? ""}`.trim();
  return n || "(No name)";
}

function fmtMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function momentumStyles(label?: RadarContact["momentum_label"]) {
  switch (label) {
    case "Rising":
      return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
    case "Warm":
      return `${PILL} border-amber-200 bg-amber-50 text-amber-700`;
    case "Cooling":
      return `${PILL} border-sky-200 bg-sky-50 text-sky-700`;
    case "Cold":
      return `${PILL} border-slate-200 bg-slate-50 text-slate-700`;
    default:
      return `${PILL} border-slate-200 bg-slate-50 text-slate-700`;
  }
}

function verticalStyles(vertical?: Vertical) {
  return vertical === "corporate"
    ? `${PILL} border-violet-200 bg-violet-50 text-violet-700`
    : `${PILL} border-orange-200 bg-orange-50 text-orange-700`;
}

function queueReasonTone(reasonType: QueueReason["type"]) {
  switch (reasonType) {
    case "radar_promotion":
      return `${PILL} border-violet-200 bg-violet-50 text-violet-700`;
    case "cadence":
      return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
    case "manual_follow_up":
      return `${PILL} border-amber-200 bg-amber-50 text-amber-700`;
    case "task_due":
    default:
      return `${PILL} border-slate-200 bg-slate-50 text-slate-700`;
  }
}

function analyticsTone(key: string) {
  switch (key) {
    case "radar_promotion":
      return "border-violet-200 bg-violet-50";
    case "cadence":
      return "border-emerald-200 bg-emerald-50";
    case "manual_follow_up":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-slate-200 bg-slate-50";
  }
}

function daysSince(ts: string | null) {
  if (!ts) return "Never touched";
  const d = new Date(ts).getTime();
  const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

function deriveQueueReason(task: TaskRow | null): QueueReason | null {
  if (!task) return null;

  const notes = (task.notes || "").toLowerCase();
  const title = (task.title || "").toLowerCase();

  if (
    notes.includes("queue_source=radar_promotion") ||
    notes.includes("promoted from priority radar") ||
    title.startsWith("work now:")
  ) {
    return {
      type: "radar_promotion",
      label: "Priority Radar Promotion",
      detail: "This contact was explicitly promoted into the live queue.",
    };
  }

  if (task.kind === "cadence" || task.cadence_key || (task.cadence_step ?? 0) > 0) {
    return {
      type: "cadence",
      label: "Cadence Execution",
      detail:
        task.cadence_step && task.cadence_step > 0
          ? `This item is here because cadence step ${task.cadence_step} is due.`
          : "This item is here because a cadence step is due.",
    };
  }

  if (task.kind === "manual") {
    return {
      type: "manual_follow_up",
      label: "Manual Follow-Up",
      detail: "This is a manually created follow-up task.",
    };
  }

  return {
    type: "task_due",
    label: "Due Task",
    detail: "This item is at the front because it is the highest-ranked actionable queue item.",
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="crm-card rounded-3xl border-0 shadow-none">
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="crm-card rounded-3xl border-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {right}
        </div>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function WorkPage() {
  const searchParams = useSearchParams();
  const forcedTaskId = (searchParams.get("task_id") || "").trim();

  const [current, setCurrent] = useState<TaskRow | null>(null);
  const [next, setNext] = useState<TaskRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [currentDetails, setCurrentDetails] = useState<RowDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [radar, setRadar] = useState<RadarContact[]>([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<QueueAnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [touchSeconds, setTouchSeconds] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [acting, setActing] = useState(false);

  const LOG_TOUCH_AS_ACTIVITY = true;

  const contact = current?.contacts ?? null;
  const activeContactId = current?.contact_id ?? null;

  const currentOrgName = useMemo(() => {
    if (!contact) return "";
    return contact.vertical === "corporate"
      ? contact.accounts?.name || ""
      : contact.schools?.name || "";
  }, [contact]);

  const contactTitle = useMemo(() => {
    if (!contact) return "";
    const name = fmtName(contact.first_name, contact.last_name);
    return currentOrgName ? `${currentOrgName} — ${name}` : name;
  }, [contact, currentOrgName]);

  const currentTopReasons = useMemo(() => {
    const items = currentDetails?.priorityBreakdown ?? [];
    return [...items]
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, 3);
  }, [currentDetails]);

  const queueReason = useMemo(() => deriveQueueReason(current), [current]);

  const radarDisplay = useMemo(() => {
    if (!activeContactId) return radar;
    const active = radar.find((r) => r.id === activeContactId);
    const rest = radar.filter((r) => r.id !== activeContactId);
    return active ? [active, ...rest] : radar;
  }, [radar, activeContactId]);

  async function fetchQueueItem(params?: { taskId?: string; excludeTaskId?: string }) {
    const qs = new URLSearchParams();

    if (params?.taskId) qs.set("task_id", params.taskId);
    if (params?.excludeTaskId) qs.set("exclude_task_id", params.excludeTaskId);

    const res = await fetchWithAuth(
      `/api/work-queue/next${qs.toString() ? `?${qs.toString()}` : ""}`
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error ?? "Failed to load queue item");
    }

    return (json?.data ?? null) as TaskRow | null;
  }

  async function fetchCurrentDetails(contactId: string) {
    setDetailsLoading(true);

    try {
      const res = await fetchWithAuth(`/api/contacts/${contactId}/row-details`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load contact intelligence");
      }

      setCurrentDetails(json as RowDetailsResponse);
    } catch (e: any) {
      console.warn("current details load failed:", e?.message || e);
      setCurrentDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function fetchRadar() {
    setRadarLoading(true);

    try {
      const res = await fetchWithAuth("/api/contacts/radar?limit=20");
      const json = (await res.json().catch(() => ({}))) as Partial<RadarResponse> & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load priority radar");
      }

      setRadar((json.data ?? []) as RadarContact[]);
    } catch (e: any) {
      console.warn("radar load failed:", e?.message || e);
      setRadar([]);
    } finally {
      setRadarLoading(false);
    }
  }

  async function fetchAnalytics() {
    setAnalyticsLoading(true);

    try {
      const res = await fetchWithAuth("/api/work/analytics");
      const json = (await res.json().catch(() => ({}))) as Partial<QueueAnalyticsResponse> & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load work analytics");
      }

      setAnalytics(json as QueueAnalyticsResponse);
    } catch (e: any) {
      console.warn("analytics load failed:", e?.message || e);
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function refreshIntelligence(contactId: string | null) {
    if (contactId) {
      void fetchCurrentDetails(contactId);
    } else {
      setCurrentDetails(null);
    }

    void fetchRadar();
    void fetchAnalytics();
  }

  async function loadInitial() {
    setLoading(true);
    setErr(null);

    try {
      let first: TaskRow | null = null;

      if (forcedTaskId) {
        first = await fetchQueueItem({ taskId: forcedTaskId });
      }

      if (!first) {
        first = await fetchQueueItem();
      }

      setCurrent(first);
      setNext(null);

      if (first?.id) {
        const second = await fetchQueueItem({ excludeTaskId: first.id });
        setNext(second);
      }

      await refreshIntelligence(first?.contact_id ?? null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load queue");
      setCurrent(null);
      setNext(null);
      setCurrentDetails(null);
      setRadar([]);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }

  async function promoteRadarContact(contactId: string) {
    setPromotingId(contactId);
    setErr(null);

    try {
      const res = await fetchWithAuth("/api/work-queue/promote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to promote contact");
      }

      await loadInitial();
    } catch (e: any) {
      setErr(e?.message || "Failed to promote contact");
    } finally {
      setPromotingId(null);
    }
  }

  function startTouchTimer() {
    stopTouchTimer();
    setTouchSeconds(0);
    touchStartRef.current = Date.now();

    tickRef.current = setInterval(() => {
      if (!touchStartRef.current) return;
      const elapsed = (Date.now() - touchStartRef.current) / 1000;
      setTouchSeconds(elapsed);
    }, 250);
  }

  function stopTouchTimer() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    touchStartRef.current = null;
  }

  async function logTouch(action: "complete" | "snooze" | "skip") {
    if (!LOG_TOUCH_AS_ACTIVITY) return;
    if (!activeContactId) return;

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return;

    const elapsed = Math.max(1, Math.round(touchSeconds));
    const body = [
      `Work Mode touch logged.`,
      ``,
      `Action: ${action}`,
      `Time on contact: ${fmtMMSS(elapsed)} (${elapsed}s)`,
      current?.title ? `Task: ${current.title}` : `Task Type: ${current?.task_type ?? "manual"}`,
    ].join("\n");

    const { error } = await supabase.from("activities").insert({
      contact_id: activeContactId,
      user_id: userId,
      type: "note",
      occurred_at: new Date().toISOString(),
      subject: "Work Mode",
      body,
      outcome: action,
    });

    if (error) {
      console.warn("touch log failed:", error.message);
    }
  }

  async function rotateToNext() {
    const nextTask = next ?? null;
    setCurrent(nextTask);
    setNext(null);

    if (nextTask) startTouchTimer();
    else stopTouchTimer();

    await refreshIntelligence(nextTask?.contact_id ?? null);

    if (nextTask?.id) {
      try {
        const preload = await fetchQueueItem({ excludeTaskId: nextTask.id });
        setNext(preload);
      } catch {
        setNext(null);
      }
    }
  }

  async function completeAndNext() {
    if (!current || acting) return;

    setActing(true);
    setErr(null);

    try {
      await logTouch("complete");

      const taskId = current.id;
      await rotateToNext();

      const res = await fetchWithAuth("/api/tasks/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to complete task");
      } else {
        void fetchAnalytics();
      }
    } finally {
      setActing(false);
    }
  }

  async function snoozeAndNext(minutes: number) {
    if (!current || acting) return;

    setActing(true);
    setErr(null);

    try {
      await logTouch("snooze");

      const taskId = current.id;
      await rotateToNext();

      const res = await fetchWithAuth("/api/tasks/snooze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, minutes }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to snooze task");
      }
    } finally {
      setActing(false);
    }
  }

  async function skipToNext() {
    if (!current || acting) return;

    setActing(true);
    setErr(null);

    try {
      await logTouch("skip");
      await rotateToNext();
    } finally {
      setActing(false);
    }
  }

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedTaskId]);

  useEffect(() => {
    if (activeContactId) startTouchTimer();
    else stopTouchTimer();

    return () => stopTouchTimer();
  }, [activeContactId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (document.activeElement as any)?.isContentEditable
      ) {
        return;
      }

      const k = e.key.toLowerCase();

      if (k === "c") {
        e.preventDefault();
        void completeAndNext();
      } else if (k === "n") {
        e.preventDefault();
        void skipToNext();
      } else if (k === "s") {
        e.preventDefault();
        void snoozeAndNext(60);
      } else if (k === "l") {
        if (activeContactId) {
          e.preventDefault();
          window.location.assign(`/contacts/${activeContactId}`);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeContactId, acting, touchSeconds, next?.id]);

  if (loading) {
    return <div className="text-muted-foreground">Loading queue…</div>;
  }

  if (!contact) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Work Queue"
          subtitle={err ? err : "Queue empty. Nice work."}
          actions={
            <div className="flex items-center gap-2">
              <Link href="/accounts" className={BTN}>Accounts Radar</Link>
              <Link href="/contacts" className={BTN}>Contacts</Link>
              <Button className={BTN_PRIMARY} onClick={() => void loadInitial()}>
                Refresh
              </Button>
            </div>
          }
        />

        <SectionCard title="Priority Radar Board" subtitle="Top 20 athletics + corporate contacts by priority score.">
          {radarLoading ? (
            <div className="text-sm text-muted-foreground">Loading radar…</div>
          ) : radarDisplay.length === 0 ? (
            <div className="text-sm text-muted-foreground">No ranked contact available.</div>
          ) : (
            <div className="space-y-3">
              {radarDisplay.map((item, idx) => {
                const name = fmtName(item.first_name, item.last_name);
                const title = item.org_name ? `${item.org_name} — ${name}` : name;

                return (
                  <div key={item.id} className="crm-card-soft rounded-2xl border-0 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">#{idx + 1}</span>
                          <span className={verticalStyles(item.vertical)}>
                            {item.vertical === "corporate" ? "Corporate" : "Athletics"}
                          </span>
                          <span className={momentumStyles(item.momentum_label)}>{item.momentum_label}</span>
                        </div>

                        <div className="mt-2 truncate font-semibold">{title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.status || "—"} • {item.cadence_status || "—"} • {daysSince(item.last_activity_at)}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {item.priority_reason || "Priority-ranked contact"}
                        </div>
                      </div>

                      <div className="crm-pill px-3 py-1 text-sm font-semibold">{item.priority_score}</div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button
                        className={BTN_PRIMARY}
                        disabled={promotingId === item.id}
                        onClick={() => void promoteRadarContact(item.id)}
                      >
                        {promotingId === item.id ? "Promoting..." : "Work Now"}
                      </Button>

                      <Link href={`/contacts/${item.id}`} className={BTN}>
                        Open
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Queue"
        subtitle={
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-muted-foreground">
              Shortcuts: <b>C</b> complete • <b>N</b> next • <b>S</b> snooze • <b>L</b> open contact
            </div>
            <div className="text-muted-foreground">
              Touch timer: <b>{fmtMMSS(touchSeconds)}</b>
            </div>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/accounts" className={BTN}>Accounts Radar</Link>
            <Link href="/contacts" className={BTN}>Contacts</Link>
            <Button variant="outline" className={BTN} onClick={() => void loadInitial()}>
              Refresh
            </Button>
          </div>
        }
      />

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">{err}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Live Contact" value={fmtName(contact.first_name, contact.last_name)} />
        <MetricCard label="Queue Source" value={queueReason?.label || "—"} />
        <MetricCard label="Current Task Due" value={formatDateTime(current?.due_at)} />
        <MetricCard label="Next Preloaded" value={next ? "Yes" : "No"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_500px]">
        <div className="space-y-6">
          <SectionCard title={contactTitle} subtitle={`${contact.job_title_raw ?? ""}${contact.job_title_raw && contact.primary_email ? " • " : ""}${contact.primary_email ?? ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={verticalStyles(contact.vertical)}>
                {contact.vertical === "corporate" ? "Corporate" : "Athletics"}
              </span>
              {current?.status ? <span className={PILL}>{current.status}</span> : null}
            </div>

            <div className="mt-3 text-sm text-muted-foreground">
              {contact.vertical === "corporate" ? "Market / Focus" : "Sport"}: {contact.sport}
            </div>

            <div className="mt-4 flex gap-2">
              <Link href={`/contacts/${activeContactId}`} className={BTN_PRIMARY}>
                Open Contact
              </Link>
              {contact.primary_email ? (
                <button
                  className={BTN}
                  onClick={() => window.open(`mailto:${contact.primary_email}`, "_blank")}
                >
                  Email
                </button>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Queue Reason">
            {queueReason ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={queueReasonTone(queueReason.type)}>{queueReason.label}</span>
                  {current?.due_at ? (
                    <span className="text-sm text-muted-foreground">
                      Due: {new Date(current.due_at).toLocaleString()}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 text-sm text-muted-foreground">{queueReason.detail}</div>

                {current?.notes ? (
                  <div className="crm-card-soft mt-4 rounded-2xl border-0 p-4 text-sm">
                    {current.notes}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No queue reason available.</div>
            )}
          </SectionCard>

          <SectionCard title="Current Task">
              <div className="text-sm font-semibold">
                {current?.title?.trim() || "(no title)"}
              </div>

              <div className="mt-2 text-sm text-muted-foreground">
                Type: {current?.task_type || "—"} • Due:{" "}
                {current?.due_at ? new Date(current.due_at).toLocaleString() : "—"}
              </div>
            
            <div className="mt-2 text-xs text-muted-foreground">
              Preloaded next: {next ? "Yes" : "No"}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button className={BTN_PRIMARY} disabled={acting} onClick={() => void completeAndNext()}>
                Complete + Next (C)
              </Button>

              <Button className={BTN} disabled={acting} onClick={() => void snoozeAndNext(60)}>
                Snooze 1h (S)
              </Button>

              <Button className={BTN} disabled={acting} onClick={() => void skipToNext()}>
                Next (N)
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Current Contact Intelligence"
            right={
              <Button className={BTN} onClick={() => void refreshIntelligence(activeContactId)}>
                Refresh Intel
              </Button>
            }
          >
            {detailsLoading ? (
              <div className="text-sm text-muted-foreground">Loading intelligence…</div>
            ) : currentDetails ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <MetricCard label="Priority" value={currentDetails.contact.priority_score} />
                  <MetricCard
                    label="Status"
                    value={`${currentDetails.contact.status}${currentDetails.contact.cadence_status ? ` • ${currentDetails.contact.cadence_status}` : ""}${currentDetails.contact.cadence_step ? ` • Step ${currentDetails.contact.cadence_step}` : ""}`}
                  />
                </div>

                <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                  <CardContent className="p-5">
                    <div className="text-sm font-semibold">Why this contact is in motion</div>
                    <div className="mt-3 space-y-3">
                      {currentTopReasons.length > 0 ? (
                        currentTopReasons.map((item, idx) => (
                          <div
                            key={`${item.label}-${idx}`}
                            className="crm-card-soft flex items-center justify-between rounded-2xl border-0 p-3 text-sm"
                          >
                            <div>{item.label}</div>
                            <div className="font-semibold">
                              {item.points >= 0 ? `+${item.points}` : item.points}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No priority breakdown available.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {currentDetails.nextBestAction ? (
                  <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                    <CardContent className="p-5">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Next Best Action
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {currentDetails.nextBestAction.label}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {currentDetails.cadencePreview ? (
                  <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                    <CardContent className="p-5">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Cadence Preview
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {currentDetails.cadencePreview.cadence_key} • Step{" "}
                        {currentDetails.cadencePreview.step}
                      </div>
                      <div className="mt-2 text-sm">
                        {currentDetails.cadencePreview.subject || "No subject"}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No intelligence available for this contact.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Manager-Grade Productivity"
            subtitle={`Last ${analytics?.window_days ?? 30} days.`}
            right={
              <Button className={BTN} onClick={() => void fetchAnalytics()}>
                Refresh Analytics
              </Button>
            }
          >
            {analyticsLoading ? (
              <div className="text-sm text-muted-foreground">Loading analytics…</div>
            ) : !analytics ? (
              <div className="text-sm text-muted-foreground">Analytics unavailable.</div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <MetricCard label="Completed Today" value={analytics.completed_today} />
                  <MetricCard label="Avg Touch Time" value={fmtMMSS(analytics.avg_touch_seconds)} />
                  <MetricCard
                    label="Promoted Contacts Completed"
                    value={analytics.promoted_contacts_completed}
                  />
                  <MetricCard
                    label="Cadence Completion Rate"
                    value={`${analytics.cadence_completion_rate}%`}
                  />
                  <MetricCard label="Snooze Rate" value={`${analytics.snooze_rate}%`} />
                  <MetricCard
                    label="Touch Completions Logged"
                    value={analytics.complete_touch_count}
                  />
                </div>

                <div className="mt-4 grid gap-3">
                  {analytics.sources.map((source) => {
                    const pct =
                      analytics.total_completed > 0
                        ? Math.round((source.count / analytics.total_completed) * 100)
                        : 0;

                    return (
                      <div
                        key={source.key}
                        className={`rounded-2xl border p-4 ${analyticsTone(source.key)}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{source.label}</div>
                          <div className="text-sm font-semibold">{source.count}</div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {pct}% of completed work
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard
            title="Priority Radar Board"
            subtitle="Top 20 athletics + corporate contacts by priority score."
            right={
              <Button className={BTN} onClick={() => void fetchRadar()}>
                Refresh Radar
              </Button>
            }
          >
            {radarLoading ? (
              <div className="text-sm text-muted-foreground">Loading radar…</div>
            ) : radarDisplay.length === 0 ? (
              <div className="text-sm text-muted-foreground">No ranked contact available.</div>
            ) : (
              <div className="max-h-[900px] space-y-3 overflow-auto pr-1">
                {radarDisplay.map((item, idx) => {
                  const name = fmtName(item.first_name, item.last_name);
                  const title = item.org_name ? `${item.org_name} — ${name}` : name;
                  const isCurrent = item.id === activeContactId;

                  return (
                    <div
                      key={item.id}
                      className={[
                        "crm-card-soft rounded-2xl border-0 p-4 transition",
                        isCurrent ? "ring-2 ring-emerald-300" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              #{idx + 1}
                            </span>
                            <span className={verticalStyles(item.vertical)}>
                              {item.vertical === "corporate" ? "Corporate" : "Athletics"}
                            </span>
                            <span className={momentumStyles(item.momentum_label)}>
                              {item.momentum_label}
                            </span>
                            {isCurrent ? <span className={PILL}>Live Queue Contact</span> : null}
                          </div>

                          <div className="mt-2 truncate font-semibold">{title}</div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.status || "—"} • {item.cadence_status || "—"}
                            {item.cadence_step > 0 ? ` • Step ${item.cadence_step}` : ""}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.vertical === "corporate"
                              ? `Focus: ${item.sport || "—"}`
                              : `Sport: ${item.sport || "—"}`}
                            {" • "}
                            {daysSince(item.last_activity_at)}
                          </div>

                          <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                            {item.priority_reason || "Priority-ranked contact"}
                          </div>
                        </div>

                        <div className="crm-pill px-3 py-1 text-sm font-semibold">
                          {item.priority_score}
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <Button
                          className={BTN_PRIMARY}
                          disabled={promotingId === item.id || isCurrent}
                          onClick={() => void promoteRadarContact(item.id)}
                        >
                          {isCurrent
                            ? "Working Now"
                            : promotingId === item.id
                              ? "Promoting..."
                              : "Work Now"}
                        </Button>

                        <Link href={`/contacts/${item.id}`} className={BTN}>
                          Open
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}