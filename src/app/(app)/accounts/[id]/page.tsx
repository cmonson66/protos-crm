"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type BuyingCommitteeRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "operator"
  | "unknown";

type WorkspaceContact = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  phone: string | null;
  job_title_raw: string | null;
  sport: string | null;
  status: string | null;
  cadence_key: string | null;
  cadence_status: string | null;
  cadence_step: number;
  cadence_next_due_at: string | null;
  last_activity_at: string | null;
  last_activity_type: string | null;
  last_activity_subject: string | null;
  updated_at: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  owner_user_id: string | null;
  priority_score: number;
  momentum_score: number;
  momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
  priority_reason: string;
  buying_committee_role: BuyingCommitteeRole;
  buying_committee_role_label: string;
};

type WorkspaceTask = {
  id: string;
  contact_id: string;
  contact_name: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  title: string | null;
  task_type: string | null;
  due_at: string | null;
  completed_at: string | null;
  notes: string | null;
  status: string | null;
  kind: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  created_at: string | null;
};

type WorkspaceTimelineItem = {
  id: string;
  contact_id: string;
  contact_name: string;
  occurred_at: string;
  type: string | null;
  kind: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  user_id: string | null;
  actor_name: string | null;
};

type WorkspaceResponse = {
  account: {
    id: string;
    name: string;
    industry: string | null;
    company_size: string | null;
    hq_location: string | null;
    website: string | null;
    active: boolean;
    created_at: string | null;
    updated_at: string | null;
  };
  summary: {
    total_contacts: number;
    active_cadences: number;
    stale_contacts: number;
    touched_last_7_days: number;
    secured_active_contacts: number;
    open_tasks: number;
    highest_priority_score: number;
    highest_priority_contact_id: string | null;
    highest_priority_contact_name: string | null;
    most_recent_activity_at: string | null;
    most_recent_activity_subject: string | null;
  };
  sequencing_intelligence: {
    account_mode: "widen" | "deepen" | "execute_now" | "recover" | "monitor";
    primary_recommendation: string;
    rationale: string[];
    recommended_contact_ids: string[];
    recommended_contacts: {
      id: string;
      full_name: string;
      buying_committee_role: BuyingCommitteeRole;
      buying_committee_role_label: string;
      priority_score: number;
      cadence_status: string | null;
      cadence_step: number;
      last_activity_at: string | null;
      why_next: string;
    }[];
    next_steps: {
      kind:
        | "work_hottest_contact"
        | "start_uncovered"
        | "restart_stale"
        | "find_missing_economic_buyer"
        | "find_missing_technical_buyer"
        | "work_due_now";
      label: string;
    }[];
    risk_flags: string[];
    stats: {
      due_now_count: number;
      uncovered_count: number;
      stale_active_count: number;
      total_contacts: number;
    };
  };
  buying_committee: Record<BuyingCommitteeRole, WorkspaceContact[]>;
  contacts: WorkspaceContact[];
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimelineItem[];
  gaps: string[];
};

function momentumStyles(label?: WorkspaceContact["momentum_label"]) {
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

function roleTone(role: BuyingCommitteeRole) {
  switch (role) {
    case "economic_buyer":
      return "border-emerald-200 bg-emerald-50";
    case "technical_buyer":
      return "border-violet-200 bg-violet-50";
    case "champion":
      return "border-sky-200 bg-sky-50";
    case "operator":
      return "border-amber-200 bg-amber-50";
    default:
      return "border-slate-200 bg-slate-50";
  }
}

function daysSinceLabel(ts: string | null) {
  if (!ts) return "Never touched";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function fmtDateTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function AccountWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const accountId = params?.id;

  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!accountId) return;

    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth(`/api/accounts/${accountId}/workspace`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load account workspace");
      setData(null);
      setLoading(false);
      return;
    }

    setData(json as WorkspaceResponse);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function runAccountAction(
    action: "work_hottest_contact" | "create_account_task" | "find_missing_buyer"
  ) {
    if (!accountId) return;

    setBusyAction(action);
    setErr(null);

    const body: Record<string, unknown> = {
      account_id: accountId,
      action,
    };

    if (action === "create_account_task") body.due_days = 2;
    if (action === "find_missing_buyer") body.due_days = 1;

    try {
      const res = await fetchWithAuth("/api/accounts/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { raw };
      }

      if (!res.ok) {
        setErr(json?.error || json?.message || json?.details || json?.raw || "Account action failed");
        setBusyAction(null);
        return;
      }

      const taskId = json?.task_id ? String(json.task_id) : "";
      setBusyAction(null);
      router.push(taskId ? `/work?task_id=${encodeURIComponent(taskId)}` : "/work");
    } catch (e: any) {
      setErr(e?.message || "Account action failed");
      setBusyAction(null);
    }
  }

  const openTasks = useMemo(
  () => (data?.tasks ?? []).filter((t) => !t.completed_at),
  [data]
);

const [cadenceBusy, setCadenceBusy] = useState<string | null>(null);
const [toast, setToast] = useState<string | null>(null);

useEffect(() => {
  if (!toast) return;
  const t = setTimeout(() => setToast(null), 1800);
  return () => clearTimeout(t);
}, [toast]);

const coordinatedCadence = useMemo(() => {
  const contacts = data?.contacts ?? [];
  const now = Date.now();

  const dueNow = contacts.filter((c) => {
    if (c.status !== "New") return false;
    if (c.cadence_status !== "active") return false;
    if (!c.cadence_next_due_at) return false;
    const due = new Date(c.cadence_next_due_at).getTime();
    return Number.isFinite(due) && due <= now;
  });

  const uncovered = contacts.filter((c) => {
    if (c.status !== "New") return false;
    return c.cadence_status !== "active";
  });

  const staleActive = contacts.filter((c) => {
    if (c.status !== "New") return false;
    if (c.cadence_status !== "active") return false;
    if (!c.last_activity_at) return true;

    const days = Math.floor(
      (Date.now() - new Date(c.last_activity_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    return days >= 7;
  });

  const blocked = contacts.filter((c) => c.status !== "New");

  return {
    dueNow,
    uncovered,
    staleActive,
    blocked,
  };
}, [data]);

async function runCoordinatedCadence(
  mode: "start_uncovered" | "restart_stale"
) {
  const contacts =
    mode === "start_uncovered"
      ? coordinatedCadence.uncovered
      : coordinatedCadence.staleActive;

  if (!contacts.length) {
    setToast(
      mode === "start_uncovered"
        ? "No uncovered stakeholders to start"
        : "No stale sequences to restart"
    );
    return;
  }

  setCadenceBusy(mode);
  setErr(null);

  let okCount = 0;
  let failCount = 0;
  let firstError = "";

  for (const contact of contacts) {
    const res = await fetchWithAuth("/api/cadence/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contact.id,
        cadence_key: contact.cadence_key || "protos_prospecting_v1",
        force_restart: mode === "restart_stale",
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      okCount += 1;
    } else {
      failCount += 1;
      if (!firstError) {
        firstError = json?.error || "Cadence execution failed";
      }
    }
  }

  await load();
  setCadenceBusy(null);

  if (failCount > 0) {
    setErr(
      `${okCount} succeeded, ${failCount} failed.${firstError ? ` ${firstError}` : ""}`
    );
  } else {
    setToast(
      mode === "start_uncovered"
        ? `Started cadence on ${okCount} stakeholder${okCount === 1 ? "" : "s"}`
        : `Restarted cadence on ${okCount} stakeholder${okCount === 1 ? "" : "s"}`
    );
  }
}

async function runSequencingAction(
  kind:
    | "work_hottest_contact"
    | "start_uncovered"
    | "restart_stale"
    | "find_missing_economic_buyer"
    | "find_missing_technical_buyer"
    | "work_due_now"
) {
  if (kind === "start_uncovered") {
    await runCoordinatedCadence("start_uncovered");
    return;
  }

  if (kind === "restart_stale") {
    await runCoordinatedCadence("restart_stale");
    return;
  }

  if (kind === "work_hottest_contact") {
    await runAccountAction("work_hottest_contact");
    return;
  }

  if (kind === "find_missing_economic_buyer" || kind === "find_missing_technical_buyer") {
    await runAccountAction("find_missing_buyer");
    return;
  }

  if (kind === "work_due_now") {
    const dueNowContact = (data?.sequencing_intelligence?.recommended_contacts ?? []).find(
      (c) => c.why_next === "Cadence due now"
    );

    if (dueNowContact?.id) {
      router.push(`/contacts/${dueNowContact.id}`);
      return;
    }

    setToast("No due-now contact available");
  }
}

  if (loading) {
    return <div className="text-muted-foreground">Loading account workspace…</div>;
  }

  if (err && !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>
        <button className="rounded-xl border px-4 py-2" onClick={() => router.push("/accounts")}>
          Back to Accounts
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="text-muted-foreground">Account workspace unavailable.</div>;
  }

  return (
  <div className="space-y-8">
    {toast ? (
      <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
        <div className="text-sm font-semibold">{toast}</div>
      </div>
    ) : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">{data.account.name}</div>

          <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>{data.account.industry || "No industry"}</span>
            <span>•</span>
            <span>{data.account.company_size || "No company size"}</span>
            <span>•</span>
            <span>{data.account.hq_location || "No HQ"}</span>
          </div>

          <div className="mt-2 text-sm text-muted-foreground">
            Website:{" "}
            {data.account.website ? (
              <a className="underline" href={data.account.website} target="_blank" rel="noreferrer">
                {data.account.website}
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button className="rounded-xl border px-4 py-2" onClick={() => router.push("/accounts")}>
            Back
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>
      ) : null}

      <div className="rounded-2xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Account Command Center</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Highest priority contact:{" "}
              <span className="font-semibold">{data.summary.highest_priority_contact_name || "—"}</span>
              {" • "}
              Heat Score: <span className="font-semibold">{data.summary.highest_priority_score}</span>
              {" • "}
              Most recent activity: <span className="font-semibold">{fmtDateTime(data.summary.most_recent_activity_at)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border px-4 py-2"
              disabled={busyAction === "work_hottest_contact"}
              onClick={() => void runAccountAction("work_hottest_contact")}
            >
              {busyAction === "work_hottest_contact" ? "Working..." : "Work Hottest Contact"}
            </button>

            <button
              className="rounded-xl border px-4 py-2"
              disabled={busyAction === "create_account_task"}
              onClick={() => void runAccountAction("create_account_task")}
            >
              {busyAction === "create_account_task" ? "Creating..." : "Create Account Task"}
            </button>

            <button
              className="rounded-xl border px-4 py-2"
              disabled={busyAction === "find_missing_buyer"}
              onClick={() => void runAccountAction("find_missing_buyer")}
            >
              {busyAction === "find_missing_buyer" ? "Creating..." : "Find Missing Buyer"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Contacts</div>
            <div className="mt-2 text-2xl font-semibold">{data.summary.total_contacts}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Active Cadences</div>
            <div className="mt-2 text-2xl font-semibold">{data.summary.active_cadences}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Touched 7d</div>
            <div className="mt-2 text-2xl font-semibold">{data.summary.touched_last_7_days}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Stale</div>
            <div className="mt-2 text-2xl font-semibold">{data.summary.stale_contacts}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Secured</div>
            <div className="mt-2 text-2xl font-semibold">{data.summary.secured_active_contacts}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Open Tasks</div>
            <div className="mt-2 text-2xl font-semibold">{data.summary.open_tasks}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-5">
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="text-lg font-semibold">Multi-Thread Sequencing Intelligence</div>
      <div className="mt-1 text-sm text-muted-foreground">
        Account mode:{" "}
        <span className="font-semibold capitalize">
          {data.sequencing_intelligence.account_mode.replace("_", " ")}
        </span>
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      {data.sequencing_intelligence.next_steps.map((step) => (
        <button
          key={step.kind}
          className="rounded-xl border px-4 py-2"
          onClick={() => void runSequencingAction(step.kind)}
          disabled={cadenceBusy === "start_uncovered" || cadenceBusy === "restart_stale"}
        >
          {step.label}
        </button>
      ))}
    </div>
  </div>

  <div className="mt-5 rounded-xl border p-4">
    <div className="text-sm font-semibold">Primary Recommendation</div>
    <div className="mt-2 text-sm text-slate-700">
      {data.sequencing_intelligence.primary_recommendation}
    </div>
  </div>

  <div className="mt-5 grid gap-4 md:grid-cols-4">
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Due Now</div>
      <div className="mt-2 text-2xl font-semibold">
        {data.sequencing_intelligence.stats.due_now_count}
      </div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Uncovered</div>
      <div className="mt-2 text-2xl font-semibold">
        {data.sequencing_intelligence.stats.uncovered_count}
      </div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Stale Active</div>
      <div className="mt-2 text-2xl font-semibold">
        {data.sequencing_intelligence.stats.stale_active_count}
      </div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Threads</div>
      <div className="mt-2 text-2xl font-semibold">
        {data.sequencing_intelligence.stats.total_contacts}
      </div>
    </div>
  </div>

  <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Rationale</div>
      <div className="mt-3 space-y-2">
        {data.sequencing_intelligence.rationale.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rationale available.</div>
        ) : (
          data.sequencing_intelligence.rationale.map((item, idx) => (
            <div key={`${item}-${idx}`} className="rounded-lg border px-3 py-2 text-sm">
              {item}
            </div>
          ))
        )}
      </div>

      <div className="mt-5 text-sm font-semibold">Risk Flags</div>
      <div className="mt-3 space-y-2">
        {data.sequencing_intelligence.risk_flags.length === 0 ? (
          <div className="text-sm text-muted-foreground">No major risk flags.</div>
        ) : (
          data.sequencing_intelligence.risk_flags.map((flag, idx) => (
            <div
              key={`${flag}-${idx}`}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              {flag}
            </div>
          ))
        )}
      </div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Recommended Contact Queue</div>
      <div className="mt-3 space-y-3">
        {data.sequencing_intelligence.recommended_contacts.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No recommended contacts available.
          </div>
        ) : (
          data.sequencing_intelligence.recommended_contacts.map((c) => (
            <div key={c.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{c.full_name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.buying_committee_role_label}
                  </div>
                </div>

                <div className="rounded-full border px-2 py-1 text-xs font-semibold">
                  {c.priority_score}
                </div>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                {c.cadence_status || "inactive"}
                {c.cadence_step > 0 ? ` • Step ${c.cadence_step}` : ""}
                {" • "}
                {daysSinceLabel(c.last_activity_at)}
              </div>

              <div className="mt-2 text-xs text-slate-700">{c.why_next}</div>

              <div className="mt-3">
                <Link
                  href={`/contacts/${c.id}`}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  Open Contact
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
</div>

<div className="rounded-2xl border p-5">
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div>
      <div className="text-lg font-semibold">Coordinated Cadence Execution</div>
      <div className="mt-1 text-sm text-muted-foreground">
        Run account-wide cadence motion across uncovered and stale stakeholders.
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      <button
        className="rounded-xl border px-4 py-2"
        disabled={cadenceBusy === "start_uncovered"}
        onClick={() => void runCoordinatedCadence("start_uncovered")}
      >
        {cadenceBusy === "start_uncovered"
          ? "Starting..."
          : `Start Uncovered (${coordinatedCadence.uncovered.length})`}
      </button>

      <button
        className="rounded-xl border px-4 py-2"
        disabled={cadenceBusy === "restart_stale"}
        onClick={() => void runCoordinatedCadence("restart_stale")}
      >
        {cadenceBusy === "restart_stale"
          ? "Restarting..."
          : `Restart Stale (${coordinatedCadence.staleActive.length})`}
      </button>
    </div>
  </div>

  <div className="mt-5 grid gap-4 md:grid-cols-4">
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Due Now</div>
      <div className="mt-2 text-2xl font-semibold">{coordinatedCadence.dueNow.length}</div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Uncovered</div>
      <div className="mt-2 text-2xl font-semibold">{coordinatedCadence.uncovered.length}</div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Stale Active</div>
      <div className="mt-2 text-2xl font-semibold">{coordinatedCadence.staleActive.length}</div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">Blocked</div>
      <div className="mt-2 text-2xl font-semibold">{coordinatedCadence.blocked.length}</div>
    </div>
  </div>

  <div className="mt-5 grid gap-4 xl:grid-cols-3">
    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Due Now</div>
      <div className="mt-3 space-y-3">
        {coordinatedCadence.dueNow.length === 0 ? (
          <div className="text-sm text-muted-foreground">No stakeholders due now.</div>
        ) : (
          coordinatedCadence.dueNow.slice(0, 6).map((c) => (
            <div key={c.id} className="rounded-xl border p-3">
              <div className="text-sm font-semibold">{c.full_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.job_title_raw || "No title"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Step {c.cadence_step} • Due {fmtDateTime(c.cadence_next_due_at)}
              </div>
              <div className="mt-2">
                <Link
                  href={`/contacts/${c.id}`}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  Open Contact
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Uncovered</div>
      <div className="mt-3 space-y-3">
        {coordinatedCadence.uncovered.length === 0 ? (
          <div className="text-sm text-muted-foreground">No uncovered stakeholders.</div>
        ) : (
          coordinatedCadence.uncovered.slice(0, 6).map((c) => (
            <div key={c.id} className="rounded-xl border p-3">
              <div className="text-sm font-semibold">{c.full_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.buying_committee_role_label} • {c.job_title_raw || "No title"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Status: {c.status} • Cadence: {c.cadence_status}
              </div>
              <div className="mt-2">
                <Link
                  href={`/contacts/${c.id}`}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  Open Contact
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    <div className="rounded-xl border p-4">
      <div className="text-sm font-semibold">Stale Active</div>
      <div className="mt-3 space-y-3">
        {coordinatedCadence.staleActive.length === 0 ? (
          <div className="text-sm text-muted-foreground">No stale active sequences.</div>
        ) : (
          coordinatedCadence.staleActive.slice(0, 6).map((c) => (
            <div key={c.id} className="rounded-xl border p-3">
              <div className="text-sm font-semibold">{c.full_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.job_title_raw || "No title"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last touch: {daysSinceLabel(c.last_activity_at)} • Step {c.cadence_step}
              </div>
              <div className="mt-2">
                <Link
                  href={`/contacts/${c.id}`}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  Open Contact
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
</div>

<div className="rounded-2xl border p-5">
  <div className="text-lg font-semibold">Gap Analysis</div>

  {data.gaps.length === 0 ? (
    <div className="mt-4 rounded-xl border bg-emerald-50 p-4 text-sm text-emerald-800">
      No major gaps detected. Buying committee coverage and account motion look healthy.
    </div>
  ) : (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {data.gaps.map((gap, idx) => (
        <div
          key={`${gap}-${idx}`}
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {gap}
        </div>
      ))}
    </div>
  )}
</div>

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Buying Committee Board</div>

        <div className="mt-4 grid gap-4 xl:grid-cols-5">
          {(
            [
              ["economic_buyer", "Economic Buyer"],
              ["technical_buyer", "Technical Buyer"],
              ["champion", "Champion"],
              ["operator", "Operator"],
              ["unknown", "Unknown"],
            ] as const
          ).map(([key, label]) => {
            const items = data.buying_committee[key] || [];

            return (
              <div key={key} className={`rounded-2xl border p-4 ${roleTone(key)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="rounded-full border bg-white px-2 py-1 text-xs font-semibold">
                    {items.length}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-xl border bg-white p-3 text-sm text-muted-foreground">
                      No contact mapped.
                    </div>
                  ) : (
                    items.map((item) => (
                      <div key={item.id} className="rounded-xl border bg-white p-3">
                        <div className="text-sm font-semibold">{item.full_name}</div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.job_title_raw || "No title"}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border px-2 py-1">
                            Priority {item.priority_score}
                          </span>

                          <span
                            className={[
                              "rounded-full border px-2 py-1",
                              momentumStyles(item.momentum_label),
                            ].join(" ")}
                          >
                            {item.momentum_label}
                          </span>

                          <span className="rounded-full border px-2 py-1">
                            {item.cadence_step > 0 ? `Step ${item.cadence_step}` : "No step"}
                          </span>
                        </div>

                        <div className="mt-2 text-xs text-muted-foreground">
                          Last touch: {daysSinceLabel(item.last_activity_at)}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Link
                            href={`/contacts/${item.id}`}
                            className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                          >
                            Open
                          </Link>

                          <button
                            className="rounded-lg border px-3 py-2 text-xs"
                            onClick={() => router.push(`/contacts/${item.id}`)}
                          >
                            Work Now
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Account Timeline</div>

          <div className="mt-4 space-y-3">
            {data.timeline.length === 0 ? (
              <div className="text-sm text-muted-foreground">No account activity found.</div>
            ) : (
              data.timeline.slice(0, 20).map((item) => (
                <div key={item.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {item.subject || item.type || "Activity"} • {item.contact_name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {fmtDateTime(item.occurred_at)}
                        {item.actor_name ? ` • ${item.actor_name}` : ""}
                      </div>
                    </div>

                    <div className="rounded-full border px-2 py-1 text-xs capitalize">
                      {item.kind}
                    </div>
                  </div>

                  {item.body ? (
                    <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                      {item.body}
                    </div>
                  ) : null}

                  {item.outcome ? (
                    <div className="mt-2 text-xs text-muted-foreground">Outcome: {item.outcome}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Open Account Tasks</div>

          <div className="mt-4 space-y-3">
            {openTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground">No open account tasks.</div>
            ) : (
              openTasks.slice(0, 20).map((task) => (
                <div key={task.id} className="rounded-xl border p-4">
                  <div className="text-sm font-semibold">{task.title || "(No title)"}</div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    Contact: {task.contact_name}
                    {" • "}
                    Owner: {task.assigned_to_name}
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    Due: {fmtDateTime(task.due_at)}
                    {" • "}
                    {task.kind || "manual"}
                  </div>

                  {task.notes ? (
                    <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                      {task.notes}
                    </div>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/contacts/${task.contact_id}`}
                      className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                    >
                      Open Contact
                    </Link>

                    <button
                      className="rounded-lg border px-3 py-2 text-xs"
                      onClick={() => router.push(`/work?task_id=${encodeURIComponent(task.id)}`)}
                    >
                      Open in Work Queue
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}