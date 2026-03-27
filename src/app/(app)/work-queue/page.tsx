"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type QueueItem = {
  task_id: string;
  contact_id: string;
  full_name: string;
  school_name: string | null;
  primary_email: string | null;
  sport: string | null;
  contact_status: string;
  cadence_status: string | null;
  cadence_step: number | null;
  assigned_to_user_id: string | null;
  task_title: string | null;
  task_notes?: string | null;
  task_type: string;
  task_kind: string;
  task_due_at: string;
  urgency: "due_now" | "due_today" | "upcoming" | "unscheduled";
  priority_score: number;
  queue_rank: number;
  school_tier: number | null;
  last_activity_at: string | null;
  updated_at: string | null;
  is_radar_promotion?: boolean;
};

type QueueResponse = {
  data: QueueItem[];
  summary: {
    total_open_items: number;
    due_now: number;
    due_today: number;
    upcoming: number;
    cadence_items: number;
    manual_items: number;
    radar_promotions?: number;
  };
  limit: number;
  error?: string;
};

function urgencyLabel(u: QueueItem["urgency"]) {
  if (u === "due_now") return "Due now";
  if (u === "due_today") return "Due today";
  if (u === "upcoming") return "Upcoming";
  return "Unscheduled";
}

function urgencyTone(u: QueueItem["urgency"]) {
  if (u === "due_now") return "border-red-200 bg-red-50 text-red-700";
  if (u === "due_today") return "border-amber-200 bg-amber-50 text-amber-700";
  if (u === "upcoming") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function taskKindTone(kind: string) {
  return kind === "cadence"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function taskActionLabel(item: QueueItem) {
  if (item.task_kind === "cadence") {
    return `Cadence Step ${item.cadence_step || 1}`;
  }

  if (item.task_title?.trim()) return item.task_title.trim();

  return item.task_type.replaceAll("_", " ");
}

function fmtDate(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function daysSince(ts: string | null) {
  if (!ts) return "Never touched";
  const diff = Math.floor(
    (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

export default function WorkQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [summary, setSummary] = useState<QueueResponse["summary"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [limit, setLimit] = useState(50);
  const [dueOnly, setDueOnly] = useState(false);
  const [urgencyFilter, setUrgencyFilter] =
    useState<"all" | "due_now" | "due_today" | "upcoming">("all");

  async function load() {
    setLoading(true);
    setErr(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (dueOnly) params.set("due_only", "1");

    const res = await fetchWithAuth(`/api/work-queue?${params.toString()}`);
    const json = (await res.json().catch(() => ({}))) as QueueResponse;

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load execution queue");
      setItems([]);
      setSummary(null);
      setLoading(false);
      return;
    }

    setItems(json.data ?? []);
    setSummary(json.summary ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, dueOnly]);

  const filtered = useMemo(() => {
    if (urgencyFilter === "all") return items;
    return items.filter((i) => i.urgency === urgencyFilter);
  }, [items, urgencyFilter]);

  const topItem = filtered[0] ?? null;

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-amber-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                Execution Queue
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  {summary?.total_open_items ?? 0} open items
                </span>

                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm">
                  {summary?.due_now ?? 0} due now
                </span>

                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm">
                  {summary?.radar_promotions ?? 0} radar promotions
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Ranked actions across cadence and manual tasks. Execute the
                highest-value work first.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => void load()} className="crm-button px-5 py-3">
                Refresh
              </button>
              {topItem ? (
                <Link
                  href={`/work?task_id=${topItem.task_id}`}
                  className="crm-button-primary px-5 py-3"
                >
                  Execute Top Item
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-7">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open Items
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.total_open_items ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Due Now
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.due_now ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Due Today
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.due_today ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Upcoming
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.upcoming ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Cadence Items
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.cadence_items ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Manual Items
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.manual_items ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Radar Promotions
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary?.radar_promotions ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value || 50))}
            className="crm-input px-4 py-3"
          >
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={75}>Top 75</option>
            <option value={100}>Top 100</option>
          </select>

          <select
            value={urgencyFilter}
            onChange={(e) =>
              setUrgencyFilter(
                e.target.value as "all" | "due_now" | "due_today" | "upcoming"
              )
            }
            className="crm-input px-4 py-3"
          >
            <option value="all">All urgency states</option>
            <option value="due_now">Due now</option>
            <option value="due_today">Due today</option>
            <option value="upcoming">Upcoming</option>
          </select>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => setDueOnly(e.target.checked)}
            />
            <span className="text-sm text-slate-700">Show only actionable</span>
          </label>

          <div className="crm-card-soft flex items-center px-4 py-3 text-sm text-slate-500">
            {loading ? "Loading queue..." : `Showing ${filtered.length} items`}
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      {topItem ? (
        <div className="crm-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">Top Queue Item</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {topItem.school_name ? `${topItem.school_name} — ` : ""}
                {topItem.full_name}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${urgencyTone(
                    topItem.urgency
                  )}`}
                >
                  {urgencyLabel(topItem.urgency)}
                </span>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${taskKindTone(
                    topItem.task_kind
                  )}`}
                >
                  {taskActionLabel(topItem)}
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Rank {topItem.queue_rank}
                </span>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                Due: {fmtDate(topItem.task_due_at)} •{" "}
                {daysSince(topItem.last_activity_at)}
              </div>
              {topItem.is_radar_promotion ? (
                <div className="mt-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                  Promoted from Priority Radar
                </div>
              ) : null}
            </div>

            <Link
              href={`/work?task_id=${topItem.task_id}`}
              className="crm-button-primary px-5 py-3"
            >
              Execute Now
            </Link>
          </div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="grid grid-cols-[110px_1.6fr_1fr_140px_160px_150px] border-b border-slate-200 bg-slate-50">
          <div className="border-r border-slate-200 p-3 text-sm font-semibold text-slate-700">
            Rank
          </div>
          <div className="border-r border-slate-200 p-3 text-sm font-semibold text-slate-700">
            Contact
          </div>
          <div className="border-r border-slate-200 p-3 text-sm font-semibold text-slate-700">
            Action
          </div>
          <div className="border-r border-slate-200 p-3 text-sm font-semibold text-slate-700">
            Urgency
          </div>
          <div className="border-r border-slate-200 p-3 text-sm font-semibold text-slate-700">
            Due
          </div>
          <div className="p-3 text-sm font-semibold text-slate-700">Execute</div>
        </div>

        {filtered.map((item) => (
          <div
            key={item.task_id}
            className="grid grid-cols-[110px_1.6fr_1fr_140px_160px_150px] border-b border-slate-100 last:border-b-0"
          >
            <div className="border-r border-slate-100 p-4">
              <div className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {item.queue_rank}
              </div>
            </div>

            <div className="border-r border-slate-100 p-4">
              <div className="text-base font-semibold text-slate-900">
                {item.school_name ? `${item.school_name} — ` : ""}
                {item.full_name}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {item.primary_email ?? ""}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {item.sport || "—"} • {item.contact_status} •{" "}
                {item.cadence_status || "—"}
                {item.school_tier ? ` • Tier ${item.school_tier}` : ""}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Last touch: {daysSince(item.last_activity_at)}
              </div>
              {item.is_radar_promotion ? (
                <div className="mt-2 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
                  Radar Promotion
                </div>
              ) : null}
            </div>

            <div className="border-r border-slate-100 p-4 text-sm">
              <div className="font-medium text-slate-900">
                {taskActionLabel(item)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {item.task_kind === "cadence"
                  ? `Cadence${item.cadence_step ? ` step ${item.cadence_step}` : ""}`
                  : item.task_type.replaceAll("_", " ")}
              </div>
            </div>

            <div className="border-r border-slate-100 p-4 text-sm">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${urgencyTone(
                  item.urgency
                )}`}
              >
                {urgencyLabel(item.urgency)}
              </span>
            </div>

            <div className="border-r border-slate-100 p-4 text-sm text-slate-500">
              {fmtDate(item.task_due_at)}
            </div>

            <div className="p-4">
              <Link
                href={`/work?task_id=${item.task_id}`}
                className="inline-block rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Execute
              </Link>
            </div>
          </div>
        ))}

        {!loading && !err && filtered.length === 0 ? (
          <div className="p-6 text-slate-500">No queue items found.</div>
        ) : null}
      </div>
    </div>
  );
}
