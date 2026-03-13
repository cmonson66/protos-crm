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
      `/api/activities/feed?limit=${encodeURIComponent(String(limit))}&q=${encodeURIComponent(q)}`
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load activity feed");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => rows, [rows]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Activity</h1>
          <div className="mt-2 text-muted-foreground">
            {loading ? "Loading..." : err ? err : `Loaded ${list.length} events.`}
          </div>
        </div>

        <button onClick={load} className="rounded-xl border px-5 py-3">
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search subject/body..."
          className="w-full max-w-xl rounded-xl border px-4 py-3"
        />

        <select
          className="rounded-xl border px-3 py-3"
          value={String(limit)}
          onChange={(e) => setLimit(parseInt(e.target.value, 10))}
        >
          <option value="60">60</option>
          <option value="120">120</option>
          <option value="200">200</option>
        </select>

        <button onClick={load} className="rounded-xl border px-5 py-3">
          Search
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {list.map((a) => {
          const c = a.contacts;
          const name =
            c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(No name)" : "(Contact)";
          const school = c?.schools?.name ? ` • ${c.schools.name}` : "";
          const title = `${name}${school}`;

          return (
            <div key={a.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {iconForType(a.type)} {a.type.toUpperCase()}
                    {a.subject ? ` • ${a.subject}` : ""}
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(a.occurred_at).toLocaleString()}
                  </div>

                  <div className="mt-2 text-sm">
                    {c ? (
                      <Link className="underline" href={`/contacts/${c.id}`}>
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                    {c?.primary_email ? (
                      <span className="text-muted-foreground"> • {c.primary_email}</span>
                    ) : null}
                    {c?.status ? (
                      <span className="text-muted-foreground"> • {c.status}</span>
                    ) : null}
                  </div>

                  {a.body ? (
                    <div className="mt-3 whitespace-pre-wrap text-sm text-slate-800">
                      {a.body}
                    </div>
                  ) : null}

                  {a.outcome ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Outcome: {a.outcome}
                    </div>
                  ) : null}
                </div>

                {c ? (
                  <Link
                    href={`/contacts/${c.id}`}
                    className="rounded-xl border px-3 py-2"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}

        {!loading && !err && list.length === 0 ? (
          <div className="text-muted-foreground">No activity yet.</div>
        ) : null}
      </div>
    </div>
  );
}