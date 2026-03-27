"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type FeedRow = {
  id: string;
  contact_id: string;
  user_id: string;
  type: string;
  occurred_at: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  created_at: string;
  contacts: null | {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_email: string | null;
    status: string;
    schools: null | { name: string };
  };
};

function iconForType(type: string) {
  const t = (type || "").toLowerCase();
  if (t === "call") return "📞";
  if (t === "email") return "✉️";
  if (t === "text") return "💬";
  if (t === "meeting") return "📅";
  return "📝";
}

function typeTone(type: string) {
  const t = (type || "").toLowerCase();
  if (t === "call") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (t === "email") return "border-sky-200 bg-sky-50 text-sky-700";
  if (t === "text") return "border-violet-200 bg-violet-50 text-violet-700";
  if (t === "meeting") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusTone(status: string | null | undefined) {
  if (status === "New") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Secured/Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "Closed/Do Not Contact") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function truncateBody(body: string, max = 280) {
  if (body.length <= max) return body;
  return `${body.slice(0, max).trimEnd()}…`;
}

export default function ActivityFeedPage() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(120);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth(
      `/api/activities/feed?limit=${encodeURIComponent(
        String(limit)
      )}&q=${encodeURIComponent(q)}`
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load activity feed");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as FeedRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => rows, [rows]);

  const summary = useMemo(() => {
    let calls = 0;
    let emails = 0;
    let texts = 0;
    let meetings = 0;

    for (const row of rows) {
      const t = (row.type || "").toLowerCase();
      if (t === "call") calls += 1;
      else if (t === "email") emails += 1;
      else if (t === "text") texts += 1;
      else if (t === "meeting") meetings += 1;
    }

    return {
      total: rows.length,
      calls,
      emails,
      texts,
      meetings,
    };
  }, [rows]);

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                Activity
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {summary.total} Events
                </span>

                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {summary.calls} Calls
                </span>

                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  {summary.emails} Emails
                </span>

                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {summary.texts} Texts
                </span>

                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  {summary.meetings} Meetings
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                {loading
                  ? "Loading activity feed..."
                  : err
                    ? err
                    : `Loaded ${list.length} events.`}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={load} className="crm-button px-5 py-3">
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-[1fr_160px_180px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject/body..."
            className="crm-input w-full px-4 py-3"
          />

          <select
            className="crm-input px-3 py-3"
            value={String(limit)}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
          >
            <option value="60">60</option>
            <option value="120">120</option>
            <option value="200">200</option>
          </select>

          <button onClick={load} className="crm-button px-5 py-3">
            Search
          </button>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="space-y-4">
        {list.map((a) => {
          const c = a.contacts;
          const name = c
            ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(No name)"
            : "(Contact)";
          const school = c?.schools?.name ? ` • ${c.schools.name}` : "";
          const title = `${name}${school}`;
          const hasLongBody = Boolean(a.body && a.body.length > 280);

          return (
            <div key={a.id} className="crm-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${typeTone(
                        a.type
                      )}`}
                    >
                      {iconForType(a.type)} {a.type.toUpperCase()}
                    </span>

                    {c?.status ? (
                      <span
                        className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(
                          c.status
                        )}`}
                      >
                        {c.status}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-base font-semibold text-slate-900">
                    {a.subject ? a.subject : `${a.type.toUpperCase()} activity`}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {new Date(a.occurred_at).toLocaleString()}
                  </div>

                  <div className="mt-3 text-sm text-slate-700">
                    {c ? (
                      <Link className="font-medium hover:underline" href={`/contacts/${c.id}`}>
                        {title}
                      </Link>
                    ) : (
                      <span className="font-medium">{title}</span>
                    )}

                    {c?.primary_email ? (
                      <span className="text-slate-500"> • {c.primary_email}</span>
                    ) : null}
                  </div>

                  {a.body ? (
                    hasLongBody ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-700">
                          View note
                        </summary>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                          {a.body}
                        </div>
                      </details>
                    ) : (
                      <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                        {truncateBody(a.body)}
                      </div>
                    )
                  ) : null}

                  {a.outcome ? (
                    <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      Outcome: {a.outcome}
                    </div>
                  ) : null}
                </div>

                {c ? (
                  <Link href={`/contacts/${c.id}`} className="crm-button px-4 py-2">
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}

        {!loading && !err && list.length === 0 ? (
          <div className="crm-card p-6 text-slate-500">No activity yet.</div>
        ) : null}
      </div>
    </div>
  );
}