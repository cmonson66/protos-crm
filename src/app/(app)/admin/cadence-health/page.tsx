"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type HealthSummary = {
  active_without_task: number;
  duplicate_open_tasks: number;
  missing_template_steps: number;
  active_without_next_due_date: number;
  task_state_mismatch: number;
  active_contacts_checked: number;
};

type HealthRow = {
  contact_id: string;
  label: string;
  cadence_key?: string | null;
  cadence_step?: number | null;
  cadence_status?: string | null;
  cadence_next_due_at?: string | null;
  duplicate_count?: number;
  task_ids?: string[];
  task_id?: string;
  task_cadence_key?: string | null;
  task_cadence_step?: number | null;
  task_due_at?: string | null;
  contact_cadence_key?: string | null;
  contact_cadence_step?: number | null;
};

type HealthResponse = {
  summary: HealthSummary;
  sections: {
    active_without_task: HealthRow[];
    duplicate_open_tasks: HealthRow[];
    missing_template_steps: HealthRow[];
    active_without_next_due_date: HealthRow[];
    task_state_mismatch: HealthRow[];
  };
};

type BulkRepairResponse = {
  ok: boolean;
  bulk?: boolean;
  action?: string;
  dry_run?: boolean;
  success_count?: number;
  failure_count?: number;
  would_change_count?: number;
  results?: {
    contact_id: string;
    ok: boolean;
    message?: string;
    error?: string;
    would_change?: boolean;
  }[];
  message?: string;
  would_change?: boolean;
  error?: string;
};

type IssueKey =
  | "all"
  | "active_without_task"
  | "duplicate_open_tasks"
  | "missing_template_steps"
  | "active_without_next_due_date"
  | "task_state_mismatch";

function fmtDate(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function SeverityCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "red" | "amber" | "blue" | "slate";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "blue"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function RepairButtons({
  actions,
  busyAction,
  onRepair,
}: {
  actions: { key: string; label: string; confirm?: string }[];
  busyAction: string | null;
  onRepair: (action: string, confirmText?: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.key}
          disabled={busyAction === a.key}
          onClick={() => onRepair(a.key, a.confirm)}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {busyAction === a.key ? "Working..." : a.label}
        </button>
      ))}
    </div>
  );
}

function BulkActionBar({
  title,
  subtitle,
  count,
  buttonLabel,
  busy,
  dryRun,
  onRun,
}: {
  title: string;
  subtitle: string;
  count: number;
  buttonLabel: string;
  busy: boolean;
  dryRun: boolean;
  onRun: () => void;
}) {
  return (
    <div className="rounded-2xl border p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
          <div className="mt-2 text-sm">
            Matches: <span className="font-semibold">{count}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Mode: {dryRun ? "Preview only" : "Execute changes"}
          </div>
        </div>

        <button
          disabled={busy || count === 0}
          onClick={onRun}
          className="rounded-xl border px-5 py-3 disabled:opacity-50"
        >
          {busy ? "Running..." : dryRun ? `Preview ${buttonLabel}` : buttonLabel}
        </button>
      </div>
    </div>
  );
}

function SectionTable({
  title,
  subtitle,
  rows,
  renderExtra,
  getActions,
  busyMap,
  onRepair,
}: {
  title: string;
  subtitle: string;
  rows: HealthRow[];
  renderExtra?: (row: HealthRow) => React.ReactNode;
  getActions?: (row: HealthRow) => { key: string; label: string; confirm?: string }[];
  busyMap: Record<string, string | null>;
  onRepair: (contactId: string, action: string, confirmText?: string) => void;
}) {
  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="border-b bg-slate-50 px-5 py-4">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      </div>

      {rows.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">No matching issues found.</div>
      ) : (
        <div className="divide-y">
          {rows.map((row, idx) => (
            <div key={`${row.contact_id}-${idx}`} className="p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="text-base font-semibold">{row.label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Cadence: {row.cadence_key || row.contact_cadence_key || "—"}
                    {" • "}
                    Step {row.cadence_step ?? row.contact_cadence_step ?? "—"}
                  </div>

                  {renderExtra ? (
                    <div className="mt-3 text-sm text-slate-700">{renderExtra(row)}</div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 xl:items-end">
                  <div className="flex gap-2">
                    <Link
                      href={`/contacts/${row.contact_id}`}
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      Open Contact
                    </Link>
                  </div>

                  {getActions ? (
                    <RepairButtons
                      actions={getActions(row)}
                      busyAction={busyMap[row.contact_id] ?? null}
                      onRepair={(action, confirmText) =>
                        onRepair(row.contact_id, action, confirmText)
                      }
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function rowMatchesQuery(row: HealthRow, query: string) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();

  const haystack = [
    row.contact_id,
    row.label,
    row.cadence_key,
    row.cadence_status,
    row.cadence_step?.toString(),
    row.task_id,
    row.task_cadence_key,
    row.task_cadence_step?.toString(),
    row.contact_cadence_key,
    row.contact_cadence_step?.toString(),
    row.task_ids?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export default function AdminCadenceHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyMap, setBusyMap] = useState<Record<string, string | null>>({});
  const [bulkBusyAction, setBulkBusyAction] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [lastBulkResult, setLastBulkResult] = useState<BulkRepairResponse | null>(null);

  const [query, setQuery] = useState("");
  const [issueFilter, setIssueFilter] = useState<IssueKey>("all");
  const [showOnlyActionable, setShowOnlyActionable] = useState(true);
  const [showOnlyPreviewChanges, setShowOnlyPreviewChanges] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth("/api/admin/cadence-health");
    const json = (await res.json().catch(() => ({}))) as Partial<HealthResponse> & {
      error?: string;
    };

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load cadence health");
      setData(null);
      setLoading(false);
      return;
    }

    setData(json as HealthResponse);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function runRepair(contactId: string, action: string, confirmText?: string) {
    if (!dryRun && confirmText && !window.confirm(confirmText)) return;

    setBusyMap((prev) => ({ ...prev, [contactId]: action }));
    setErr(null);

    const res = await fetchWithAuth("/api/admin/cadence-health/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        action,
        dry_run: dryRun,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Repair action failed");
      setBusyMap((prev) => ({ ...prev, [contactId]: null }));
      return;
    }

    setToast(
      dryRun
        ? `Preview: ${json?.message ?? "No changes"}`
        : json?.message ?? "Repair action complete"
    );

    setBusyMap((prev) => ({ ...prev, [contactId]: null }));

    if (!dryRun) {
      await load();
    }
  }

  async function runBulkRepair(
    action: string,
    contactIds: string[],
    confirmText: string
  ) {
    if (contactIds.length === 0) return;
    if (!dryRun && !window.confirm(confirmText)) return;

    setBulkBusyAction(action);
    setErr(null);
    setLastBulkResult(null);

    const res = await fetchWithAuth("/api/admin/cadence-health/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        contact_ids: contactIds,
        dry_run: dryRun,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as BulkRepairResponse;

    if (!res.ok) {
      setErr(json?.error ?? "Bulk repair action failed");
      setBulkBusyAction(null);
      return;
    }

    setLastBulkResult(json);

    const successCount = Number(json?.success_count || 0);
    const failureCount = Number(json?.failure_count || 0);
    const wouldChangeCount = Number(json?.would_change_count || 0);

    setToast(
      dryRun
        ? `Preview complete. Would change: ${wouldChangeCount}${failureCount ? ` • Failed: ${failureCount}` : ""}`
        : `Bulk repair complete. Success: ${successCount}${failureCount ? ` • Failed: ${failureCount}` : ""}`
    );

    setBulkBusyAction(null);

    if (!dryRun) {
      await load();
    }
  }

  const summary = data?.summary;

  const filteredSections = useMemo(() => {
    if (!data) {
      return {
        active_without_task: [] as HealthRow[],
        duplicate_open_tasks: [] as HealthRow[],
        missing_template_steps: [] as HealthRow[],
        active_without_next_due_date: [] as HealthRow[],
        task_state_mismatch: [] as HealthRow[],
      };
    }

    const filterRows = (rows: HealthRow[]) =>
      rows.filter((row) => rowMatchesQuery(row, query));

    return {
      active_without_task: filterRows(data.sections.active_without_task),
      duplicate_open_tasks: filterRows(data.sections.duplicate_open_tasks),
      missing_template_steps: filterRows(data.sections.missing_template_steps),
      active_without_next_due_date: filterRows(data.sections.active_without_next_due_date),
      task_state_mismatch: filterRows(data.sections.task_state_mismatch),
    };
  }, [data, query]);

  const bulkSets = useMemo(() => {
    const unique = (ids: string[]) => Array.from(new Set(ids));

    return {
      missingTaskIds: unique(filteredSections.active_without_task.map((r) => r.contact_id)),
      duplicateIds: unique(filteredSections.duplicate_open_tasks.map((r) => r.contact_id)),
      missingTemplateIds: unique(filteredSections.missing_template_steps.map((r) => r.contact_id)),
      missingDueIds: unique(filteredSections.active_without_next_due_date.map((r) => r.contact_id)),
      mismatchIds: unique(filteredSections.task_state_mismatch.map((r) => r.contact_id)),
    };
  }, [filteredSections]);

  const previewChangedIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of lastBulkResult?.results ?? []) {
      if (row.would_change) set.add(row.contact_id);
    }
    return set;
  }, [lastBulkResult]);

  const visibleIssue = (key: IssueKey) => issueFilter === "all" || issueFilter === key;

  const applyActionableFilter = (key: IssueKey, rows: HealthRow[]) => {
    let out = rows;

    if (showOnlyPreviewChanges && lastBulkResult?.dry_run) {
      out = out.filter((r) => previewChangedIds.has(r.contact_id));
    }

    if (!showOnlyActionable) return out;

    switch (key) {
      case "active_without_task":
      case "duplicate_open_tasks":
      case "missing_template_steps":
      case "active_without_next_due_date":
      case "task_state_mismatch":
        return out;
      default:
        return out;
    }
  };

  const visibleSections = {
    active_without_task: applyActionableFilter(
      "active_without_task",
      filteredSections.active_without_task
    ),
    duplicate_open_tasks: applyActionableFilter(
      "duplicate_open_tasks",
      filteredSections.duplicate_open_tasks
    ),
    missing_template_steps: applyActionableFilter(
      "missing_template_steps",
      filteredSections.missing_template_steps
    ),
    active_without_next_due_date: applyActionableFilter(
      "active_without_next_due_date",
      filteredSections.active_without_next_due_date
    ),
    task_state_mismatch: applyActionableFilter(
      "task_state_mismatch",
      filteredSections.task_state_mismatch
    ),
  };

  const visibleCounts = {
    active_without_task: visibleSections.active_without_task.length,
    duplicate_open_tasks: visibleSections.duplicate_open_tasks.length,
    missing_template_steps: visibleSections.missing_template_steps.length,
    active_without_next_due_date: visibleSections.active_without_next_due_date.length,
    task_state_mismatch: visibleSections.task_state_mismatch.length,
  };

  return (
    <div>
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Cadence Health</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            Diagnostics and repair console for autonomous cadence integrity.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Preview only
          </label>

          <button onClick={() => load()} className="rounded-xl border px-5 py-3">
            Refresh
          </button>
        </div>
      </div>

      {loading ? <div className="mt-8 text-muted-foreground">Loading cadence health…</div> : null}
      {err ? <div className="mt-8 text-red-600">{err}</div> : null}

      {!loading && !err && data ? (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SeverityCard
              title="Active cadence, no task"
              value={visibleCounts.active_without_task}
              tone="red"
            />
            <SeverityCard
              title="Duplicate open tasks"
              value={visibleCounts.duplicate_open_tasks}
              tone="red"
            />
            <SeverityCard
              title="Missing template steps"
              value={visibleCounts.missing_template_steps}
              tone="amber"
            />
            <SeverityCard
              title="Missing next due date"
              value={visibleCounts.active_without_next_due_date}
              tone="amber"
            />
            <SeverityCard
              title="Task/contact mismatch"
              value={visibleCounts.task_state_mismatch}
              tone="blue"
            />
          </div>

          <div className="rounded-2xl border p-5">
            <div className="text-lg font-semibold">System Summary</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Active cadence contacts checked: {summary?.active_contacts_checked ?? 0}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Mode: <span className="font-semibold">{dryRun ? "Preview only" : "Execute changes"}</span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search coach, school, cadence key, task id..."
                className="rounded-xl border px-4 py-3"
              />

              <select
                value={issueFilter}
                onChange={(e) => setIssueFilter(e.target.value as IssueKey)}
                className="rounded-xl border px-4 py-3"
              >
                <option value="all">All issue types</option>
                <option value="active_without_task">Active cadence, no task</option>
                <option value="duplicate_open_tasks">Duplicate open tasks</option>
                <option value="missing_template_steps">Missing template steps</option>
                <option value="active_without_next_due_date">Missing next due date</option>
                <option value="task_state_mismatch">Task/contact mismatch</option>
              </select>

              <label className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={showOnlyActionable}
                  onChange={(e) => setShowOnlyActionable(e.target.checked)}
                />
                Show only actionable
              </label>

              <label className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={showOnlyPreviewChanges}
                  onChange={(e) => setShowOnlyPreviewChanges(e.target.checked)}
                />
                Show only preview changes
              </label>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BulkActionBar
              title="Bulk: Recreate Missing Tasks"
              subtitle="Creates the missing current-step task for filtered active cadence contacts with no open task."
              count={bulkSets.missingTaskIds.length}
              buttonLabel="Run Bulk Recreate"
              busy={bulkBusyAction === "recreate_current_task"}
              dryRun={dryRun}
              onRun={() =>
                runBulkRepair(
                  "recreate_current_task",
                  bulkSets.missingTaskIds,
                  `Recreate missing tasks for ${bulkSets.missingTaskIds.length} filtered contact(s)?`
                )
              }
            />

            <BulkActionBar
              title="Bulk: Dedupe Current-Step Tasks"
              subtitle="Keeps the newest current-step task and closes duplicate open tasks for filtered contacts."
              count={bulkSets.duplicateIds.length}
              buttonLabel="Run Bulk Dedupe"
              busy={bulkBusyAction === "dedupe_tasks"}
              dryRun={dryRun}
              onRun={() =>
                runBulkRepair(
                  "dedupe_tasks",
                  bulkSets.duplicateIds,
                  `Dedupe tasks for ${bulkSets.duplicateIds.length} filtered contact(s)?`
                )
              }
            />

            <BulkActionBar
              title="Bulk: Stop Broken Cadences"
              subtitle="Stops filtered active cadences whose current template step is missing or inactive."
              count={bulkSets.missingTemplateIds.length}
              buttonLabel="Run Bulk Stop"
              busy={bulkBusyAction === "stop_cadence"}
              dryRun={dryRun}
              onRun={() =>
                runBulkRepair(
                  "stop_cadence",
                  bulkSets.missingTemplateIds,
                  `Stop broken cadences for ${bulkSets.missingTemplateIds.length} filtered contact(s)?`
                )
              }
            />

            <BulkActionBar
              title="Bulk: Recalculate Missing Due Dates"
              subtitle="Recalculates cadence_next_due_at and current-step task due date for filtered contacts."
              count={bulkSets.missingDueIds.length}
              buttonLabel="Run Bulk Recalculate"
              busy={bulkBusyAction === "recalculate_due_date"}
              dryRun={dryRun}
              onRun={() =>
                runBulkRepair(
                  "recalculate_due_date",
                  bulkSets.missingDueIds,
                  `Recalculate due dates for ${bulkSets.missingDueIds.length} filtered contact(s)?`
                )
              }
            />

            <BulkActionBar
              title="Bulk: Resync Task State"
              subtitle="Closes mismatched cadence tasks and recreates/resyncs the current-step task for filtered contacts."
              count={bulkSets.mismatchIds.length}
              buttonLabel="Run Bulk Resync"
              busy={bulkBusyAction === "resync_tasks"}
              dryRun={dryRun}
              onRun={() =>
                runBulkRepair(
                  "resync_tasks",
                  bulkSets.mismatchIds,
                  `Resync task state for ${bulkSets.mismatchIds.length} filtered contact(s)?`
                )
              }
            />
          </div>

          {lastBulkResult?.results?.length ? (
            <div className="rounded-2xl border overflow-hidden">
              <div className="border-b bg-slate-50 px-5 py-4">
                <div className="text-lg font-semibold">
                  {lastBulkResult.dry_run ? "Preview Results" : "Bulk Repair Results"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Success: {lastBulkResult.success_count ?? 0}
                  {" • "}
                  Failed: {lastBulkResult.failure_count ?? 0}
                  {" • "}
                  Would change: {lastBulkResult.would_change_count ?? 0}
                </div>
              </div>

              <div className="divide-y">
                {(showOnlyPreviewChanges && lastBulkResult.dry_run
                  ? (lastBulkResult.results ?? []).filter((r) => r.would_change)
                  : lastBulkResult.results ?? []
                ).map((row, idx) => (
                  <div key={`${row.contact_id}-${idx}`} className="p-4">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div className="text-sm font-medium">{row.contact_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.ok ? (row.would_change ? "Would change" : "No change") : "Failed"}
                      </div>
                    </div>

                    <div className="mt-1 text-sm text-slate-700">
                      {row.ok ? row.message : row.error}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visibleIssue("active_without_task") ? (
            <SectionTable
              title="Active cadence, no open task"
              subtitle="These contacts are marked active but do not have an open cadence task for their current step."
              rows={visibleSections.active_without_task}
              busyMap={busyMap}
              onRepair={runRepair}
              renderExtra={(row) => (
                <>
                  <div>Cadence status: {row.cadence_status || "—"}</div>
                  <div>Next due at: {fmtDate(row.cadence_next_due_at)}</div>
                </>
              )}
              getActions={() => [
                { key: "recreate_current_task", label: "Recreate Task" },
                { key: "stop_cadence", label: "Stop Cadence", confirm: "Stop this cadence safely?" },
              ]}
            />
          ) : null}

          {visibleIssue("duplicate_open_tasks") ? (
            <SectionTable
              title="Duplicate open cadence tasks"
              subtitle="These contacts have more than one open cadence task for the same current step."
              rows={visibleSections.duplicate_open_tasks}
              busyMap={busyMap}
              onRepair={runRepair}
              renderExtra={(row) => (
                <>
                  <div>Duplicate count: {row.duplicate_count ?? 0}</div>
                  <div>Task IDs: {(row.task_ids ?? []).join(", ") || "—"}</div>
                </>
              )}
              getActions={() => [{ key: "dedupe_tasks", label: "Keep Newest / Close Others" }]}
            />
          ) : null}

          {visibleIssue("missing_template_steps") ? (
            <SectionTable
              title="Missing or inactive template steps"
              subtitle="The contact’s active cadence step does not exist as an active template step."
              rows={visibleSections.missing_template_steps}
              busyMap={busyMap}
              onRepair={runRepair}
              getActions={() => [
                { key: "stop_cadence", label: "Stop Broken Cadence", confirm: "Stop this broken cadence safely?" },
              ]}
            />
          ) : null}

          {visibleIssue("active_without_next_due_date") ? (
            <SectionTable
              title="Active cadence with no next due date"
              subtitle="These contacts are active in cadence but have no cadence_next_due_at value."
              rows={visibleSections.active_without_next_due_date}
              busyMap={busyMap}
              onRepair={runRepair}
              getActions={() => [{ key: "recalculate_due_date", label: "Recalculate Due Date" }]}
            />
          ) : null}

          {visibleIssue("task_state_mismatch") ? (
            <SectionTable
              title="Task/contact state mismatch"
              subtitle="Open cadence task state does not match the contact’s current cadence step."
              rows={visibleSections.task_state_mismatch}
              busyMap={busyMap}
              onRepair={runRepair}
              renderExtra={(row) => (
                <>
                  <div>
                    Contact state: {row.contact_cadence_key || "—"} • Step{" "}
                    {row.contact_cadence_step ?? "—"}
                  </div>
                  <div>
                    Task state: {row.task_cadence_key || "—"} • Step{" "}
                    {row.task_cadence_step ?? "—"}
                  </div>
                  <div>Task due at: {fmtDate(row.task_due_at)}</div>
                  <div>Task ID: {row.task_id || "—"}</div>
                </>
              )}
              getActions={() => [{ key: "resync_tasks", label: "Resync to Contact Step" }]}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}