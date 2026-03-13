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
  task_type: string;
  task_kind: string;
  task_due_at: string;
  urgency: "due_now" | "due_today" | "upcoming" | "unscheduled";
  priority_score: number;
  queue_rank: number;
  school_tier: number | null;
  last_activity_at: string | null;
  updated_at: string | null;
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
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24));
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
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "due_now" | "due_today" | "upcoming">("all");

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, dueOnly]);

  const filtered = useMemo(() => {
    if (urgencyFilter === "all") return items;
    return items.filter((i) => i.urgency === urgencyFilter);
  }, [items, urgencyFilter]);

  const topItem = filtered[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Execution Queue</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            Ranked actions across cadence and manual tasks. Execute the highest-value work first.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={load} className="rounded-xl border px-5 py-3">
            Refresh
          </button>
          {topItem ? (
            <Link
              href={`/contacts/${topItem.contact_id}`}
              className="rounded-xl border px-5 py-3"
            >
              Open Top Item
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl border p-4">
          <div className="text-xs text-muted-foreground">Open Items</div>
          <div className="mt-2 text-3xl font-semibold">{summary?.total_open_items ?? 0}</div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="text-xs text-muted-foreground">Due Now</div>
          <div className="mt-2 text-3xl font-semibold">{summary?.due_now ?? 0}</div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="text-xs text-muted-foreground">Due Today</div>
          <div className="mt-2 text-3xl font-semibold">{summary?.due_today ?? 0}</div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="text-xs text-muted-foreground">Upcoming</div>
          <div className="mt-2 text-3xl font-semibold">{summary?.upcoming ?? 0}</div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="text-xs text-muted-foreground">Cadence Items</div>
          <div className="mt-2 text-3xl font-semibold">{summary?.cadence_items ?? 0}</div>
        </div>

        <div className="rounded-2xl border p-4">
          <div className="text-xs text-muted-foreground">Manual Items</div>
          <div className="mt-2 text-3xl font-semibold">{summary?.manual_items ?? 0}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value || 50))}
          className="rounded-xl border px-4 py-3"
        >
          <option value={25}>Top 25</option>
          <option value={50}>Top 50</option>
          <option value={75}>Top 75</option>
          <option value={100}>Top 100</option>
        </select>

        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value as "all" | "due_now" | "due_today" | "upcoming")}
          className="rounded-xl border px-4 py-3"
        >
          <option value="all">All urgency states</option>
          <option value="due_now">Due now</option>
          <option value="due_today">Due today</option>
          <option value="upcoming">Upcoming</option>
        </select>

        <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => setDueOnly(e.target.checked)}
          />
          <span className="text-sm">Show only actionable</span>
        </label>

        <div className="rounded-xl border px-4 py-3 text-sm text-muted-foreground flex items-center">
          {loading ? "Loading queue..." : `Showing ${filtered.length} items`}
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      {topItem ? (
        <div className="rounded-2xl border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Top Queue Item</div>
              <div className="mt-2 text-2xl font-semibold">
                {topItem.school_name ? `${topItem.school_name} — ` : ""}
                {topItem.full_name}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {taskActionLabel(topItem)} • {urgencyLabel(topItem.urgency)} • Score {topItem.queue_rank}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Due: {fmtDate(topItem.task_due_at)} • {daysSince(topItem.last_activity_at)}
              </div>
            </div>

            <Link
              href={`/contacts/${topItem.contact_id}`}
              className="rounded-xl border px-5 py-3"
            >
              Execute Now
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border overflow-hidden">
        <div className="grid grid-cols-[110px_1.6fr_1fr_140px_160px_150px] border-b bg-slate-50">
          <div className="p-3 text-sm font-semibold border-r">Rank</div>
          <div className="p-3 text-sm font-semibold border-r">Contact</div>
          <div className="p-3 text-sm font-semibold border-r">Action</div>
          <div className="p-3 text-sm font-semibold border-r">Urgency</div>
          <div className="p-3 text-sm font-semibold border-r">Due</div>
          <div className="p-3 text-sm font-semibold">Execute</div>
        </div>

        {filtered.map((item) => (
          <div
            key={item.task_id}
            className="grid grid-cols-[110px_1.6fr_1fr_140px_160px_150px] border-b last:border-b-0"
          >
            <div className="p-4 border-r">
              <div className="rounded-full border px-3 py-1 text-xs font-semibold inline-block">
                {item.queue_rank}
              </div>
            </div>

            <div className="p-4 border-r">
              <div className="text-base font-semibold">
                {item.school_name ? `${item.school_name} — ` : ""}
                {item.full_name}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {item.primary_email ?? ""}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {item.sport} • {item.contact_status} • {item.cadence_status}
                {item.school_tier ? ` • Tier ${item.school_tier}` : ""}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last touch: {daysSince(item.last_activity_at)}
              </div>
            </div>

            <div className="p-4 border-r text-sm">
              <div className="font-medium">{taskActionLabel(item)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {item.task_kind === "cadence"
                  ? `Cadence${item.cadence_step ? ` step ${item.cadence_step}` : ""}`
                  : item.task_type.replaceAll("_", " ")}
              </div>
            </div>

            <div className="p-4 border-r text-sm">
              {urgencyLabel(item.urgency)}
            </div>

            <div className="p-4 border-r text-sm text-muted-foreground">
              {fmtDate(item.task_due_at)}
            </div>

            <div className="p-4">
              <Link
                href={`/contacts/${item.contact_id}`}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 inline-block"
              >
                Open Contact
              </Link>
            </div>
          </div>
        ))}

        {!loading && !err && filtered.length === 0 ? (
          <div className="p-6 text-muted-foreground">No queue items found.</div>
        ) : null}
      </div>
    </div>
  );
}