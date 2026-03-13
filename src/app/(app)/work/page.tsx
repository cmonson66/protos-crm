"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { supabase } from "@/lib/supabaseClient";

import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Vertical = "coaching" | "corporate";

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
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Warm":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cooling":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "Cold":
      return "bg-slate-50 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function verticalStyles(vertical?: Vertical) {
  return vertical === "corporate"
    ? "bg-violet-50 text-violet-700 border-violet-200"
    : "bg-sky-50 text-sky-700 border-sky-200";
}

function queueReasonTone(reasonType: QueueReason["type"]) {
  switch (reasonType) {
    case "radar_promotion":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "cadence":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "manual_follow_up":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "task_due":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
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
    detail: "This item is at the front because it is the earliest open due task.",
  };
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

  async function fetchTaskById(taskId: string) {
    const res = await fetchWithAuth(`/api/tasks/by-id?task_id=${encodeURIComponent(taskId)}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error ?? "Failed to load task by id");
    }

    return (json?.data ?? null) as TaskRow | null;
  }

  async function fetchNext(excludeTaskId?: string) {
    const qs = excludeTaskId
      ? `?exclude_task_id=${encodeURIComponent(excludeTaskId)}`
      : "";

    const res = await fetchWithAuth(`/api/tasks/next${qs}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error ?? "Failed to load next task");
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
        first = await fetchTaskById(forcedTaskId);
      }

      if (!first) {
        first = await fetchNext();
      }

      setCurrent(first);
      setNext(null);

      if (first?.id) {
        const second = await fetchNext(first.id);
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
      const res = await fetchWithAuth("/api/tasks/promote-contact", {
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
        const preload = await fetchNext(nextTask.id);
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
              <Button variant="outline" className="rounded-xl" asChild>
                <Link href="/accounts">Accounts Radar</Link>
              </Button>

              <Button variant="outline" className="rounded-xl" asChild>
                <Link href="/contacts">Contacts</Link>
              </Button>

              <Button className="rounded-xl" onClick={() => void loadInitial()}>
                Refresh
              </Button>
            </div>
          }
        />

        <Card className="rounded-2xl">
          <CardContent className="p-8 text-center text-muted-foreground">
            No open tasks right now.
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Priority Radar Board</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Top 20 coaching + corporate contacts by priority score.
                </div>
              </div>

              <Button variant="outline" className="rounded-xl" onClick={() => void fetchRadar()}>
                Refresh Radar
              </Button>
            </div>

            {radarLoading ? (
              <div className="text-sm text-muted-foreground">Loading radar…</div>
            ) : radarDisplay.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No ranked contact available.
              </div>
            ) : (
              <div className="space-y-3">
                {radarDisplay.map((item, idx) => {
                  const name = fmtName(item.first_name, item.last_name);
                  const title = item.org_name ? `${item.org_name} — ${name}` : name;

                  return (
                    <div key={item.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              #{idx + 1}
                            </span>
                            <span
                              className={[
                                "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                                verticalStyles(item.vertical),
                              ].join(" ")}
                            >
                              {item.vertical === "corporate" ? "Corporate" : "Coaching"}
                            </span>
                          </div>

                          <div className="mt-2 truncate text-sm font-semibold">{title}</div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.status || "—"} • {item.cadence_status || "—"} •{" "}
                            {daysSince(item.last_activity_at)}
                          </div>

                          <div className="mt-2 text-xs text-muted-foreground">
                            {item.priority_reason || "Priority-ranked contact"}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="rounded-lg border px-3 py-1 text-sm font-semibold">
                            {item.priority_score}
                          </div>
                          <div
                            className={[
                              "mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                              momentumStyles(item.momentum_label),
                            ].join(" ")}
                          >
                            {item.momentum_label}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button
                          className="rounded-xl"
                          size="sm"
                          disabled={promotingId === item.id}
                          onClick={() => void promoteRadarContact(item.id)}
                        >
                          {promotingId === item.id ? "Promoting..." : "Work Now"}
                        </Button>

                        <Button variant="outline" size="sm" className="rounded-xl" asChild>
                          <Link href={`/contacts/${item.id}`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
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
            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/accounts">Accounts Radar</Link>
            </Button>

            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/contacts">Contacts</Link>
            </Button>

            <Button variant="outline" className="rounded-xl" onClick={() => void loadInitial()}>
              Refresh
            </Button>
          </div>
        }
      />

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_500px]">
        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex rounded-full border px-3 py-1 text-sm font-semibold",
                    verticalStyles(contact.vertical),
                  ].join(" ")}
                >
                  {contact.vertical === "corporate" ? "Corporate" : "Coaching"}
                </span>
              </div>

              <div className="text-2xl font-semibold">{contactTitle}</div>

              <div className="text-sm text-muted-foreground">
                {contact.job_title_raw ?? ""}
                {contact.job_title_raw && contact.primary_email ? " • " : ""}
                {contact.primary_email ?? ""}
              </div>

              <div className="text-sm text-muted-foreground">
                {contact.vertical === "corporate" ? "Market / Focus" : "Sport"}: {contact.sport}
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="rounded-xl" asChild>
                  <Link href={`/contacts/${activeContactId}`}>Open Contact</Link>
                </Button>

                {contact.primary_email ? (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => window.open(`mailto:${contact.primary_email}`, "_blank")}
                  >
                    Email
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <div className="text-lg font-semibold">Queue Reason</div>

              {queueReason ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "inline-flex rounded-full border px-3 py-1 text-sm font-semibold",
                        queueReasonTone(queueReason.type),
                      ].join(" ")}
                    >
                      {queueReason.label}
                    </span>

                    {current?.due_at ? (
                      <span className="text-sm text-muted-foreground">
                        Due: {new Date(current.due_at).toLocaleString()}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground">{queueReason.detail}</div>

                  {current?.notes ? (
                    <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                      {current.notes}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No queue reason available.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="space-y-2 p-5">
              <div className="text-lg font-semibold">Current Task</div>

              <div className="text-sm">
                <b>{current.title?.trim() || "(no title)"}</b>
              </div>

              <div className="text-sm text-muted-foreground">
                Type: {current.task_type} • Due:{" "}
                {current.due_at ? new Date(current.due_at).toLocaleString() : "—"}
              </div>

              <div className="text-xs text-muted-foreground">
                Preloaded next: {next ? "Yes" : "No"}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button className="rounded-xl" disabled={acting} onClick={() => void completeAndNext()}>
              Complete + Next (C)
            </Button>

            <Button
              variant="outline"
              className="rounded-xl"
              disabled={acting}
              onClick={() => void snoozeAndNext(60)}
            >
              Snooze 1h (S)
            </Button>

            <Button
              variant="outline"
              className="rounded-xl"
              disabled={acting}
              onClick={() => void skipToNext()}
            >
              Next (N)
            </Button>
          </div>

          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold">Current Contact Intelligence</div>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => void refreshIntelligence(activeContactId)}
                >
                  Refresh Intel
                </Button>
              </div>

              {detailsLoading ? (
                <div className="text-sm text-muted-foreground">Loading intelligence…</div>
              ) : currentDetails ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-xl border px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Priority
                      </div>
                      <div className="mt-1 text-2xl font-semibold">
                        {currentDetails.contact.priority_score}
                      </div>
                    </div>

                    <div className="rounded-xl border px-3 py-2 text-sm">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Status
                      </div>
                      <div className="mt-1 font-medium">
                        {currentDetails.contact.status}
                        {currentDetails.contact.cadence_status
                          ? ` • ${currentDetails.contact.cadence_status}`
                          : ""}
                        {currentDetails.contact.cadence_step
                          ? ` • Step ${currentDetails.contact.cadence_step}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Why this contact is in motion</div>
                    {currentTopReasons.length > 0 ? (
                      currentTopReasons.map((item, idx) => (
                        <div
                          key={`${item.label}-${idx}`}
                          className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
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

                  {currentDetails.nextBestAction ? (
                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Next Best Action
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {currentDetails.nextBestAction.label}
                      </div>
                    </div>
                  ) : null}

                  {currentDetails.cadencePreview ? (
                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Cadence Preview
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {currentDetails.cadencePreview.cadence_key} • Step{" "}
                        {currentDetails.cadencePreview.step}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">
                        {currentDetails.cadencePreview.subject || "No subject"}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No intelligence available for this contact.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Manager-Grade Productivity</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Last {analytics?.window_days ?? 30} days.
                  </div>
                </div>

                <Button variant="outline" className="rounded-xl" onClick={() => void fetchAnalytics()}>
                  Refresh Analytics
                </Button>
              </div>

              {analyticsLoading ? (
                <div className="text-sm text-muted-foreground">Loading analytics…</div>
              ) : !analytics ? (
                <div className="text-sm text-muted-foreground">Analytics unavailable.</div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Completed Today
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{analytics.completed_today}</div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Avg Touch Time
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {fmtMMSS(analytics.avg_touch_seconds)}
                      </div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Promoted Contacts Completed
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {analytics.promoted_contacts_completed}
                      </div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Cadence Completion Rate
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {analytics.cadence_completion_rate}%
                      </div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Snooze Rate
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{analytics.snooze_rate}%</div>
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Touch Completions Logged
                      </div>
                      <div className="mt-2 text-2xl font-semibold">
                        {analytics.complete_touch_count}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {analytics.sources.map((source) => {
                      const pct =
                        analytics.total_completed > 0
                          ? Math.round((source.count / analytics.total_completed) * 100)
                          : 0;

                      return (
                        <div
                          key={source.key}
                          className={`rounded-xl border p-4 ${analyticsTone(source.key)}`}
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
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Priority Radar Board</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Top 20 coaching + corporate contacts by priority score.
                  </div>
                </div>

                <Button variant="outline" className="rounded-xl" onClick={() => void fetchRadar()}>
                  Refresh Radar
                </Button>
              </div>

              {radarLoading ? (
                <div className="text-sm text-muted-foreground">Loading radar…</div>
              ) : radarDisplay.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No ranked contact available.
                </div>
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
                          "rounded-xl border p-3 transition-colors",
                          isCurrent ? "border-emerald-300 bg-emerald-50/60" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                #{idx + 1}
                              </span>

                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                                  verticalStyles(item.vertical),
                                ].join(" ")}
                              >
                                {item.vertical === "corporate" ? "Corporate" : "Coaching"}
                              </span>

                              {isCurrent ? (
                                <span className="inline-flex rounded-full border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                                  Live Queue Contact
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 truncate text-sm font-semibold">{title}</div>

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

                          <div className="shrink-0 text-right">
                            <div className="rounded-lg border px-3 py-1 text-sm font-semibold">
                              {item.priority_score}
                            </div>

                            <div
                              className={[
                                "mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                                momentumStyles(item.momentum_label),
                              ].join(" ")}
                            >
                              {item.momentum_label}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button
                            className="rounded-xl"
                            size="sm"
                            disabled={promotingId === item.id || isCurrent}
                            onClick={() => void promoteRadarContact(item.id)}
                          >
                            {isCurrent
                              ? "Working Now"
                              : promotingId === item.id
                                ? "Promoting..."
                                : "Work Now"}
                          </Button>

                          <Button variant="outline" size="sm" className="rounded-xl" asChild>
                            <Link href={`/contacts/${item.id}`}>Open</Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}