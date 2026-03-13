"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type SchoolAccountRow = {
  id: string;
  name: string;
  tier: number | null;
  total_contacts: number;
  reps_assigned: { user_id: string; name: string }[];
  rep_count: number;
  last_activity_at: string | null;
  pipeline_penetration_score: number;
  cadence_coverage: number;
  secured_active_count: number;
  do_not_contact_count: number;
  new_count: number;
  active_cadence_count: number;
  recent_contacts: {
    id: string;
    full_name: string;
    primary_email: string | null;
    sport: string | null;
    status: string | null;
    cadence_status: string | null;
    last_activity_at: string | null;
  }[];
};

type SortBy =
  | "contacts"
  | "name"
  | "tier"
  | "penetration"
  | "cadence_coverage"
  | "last_activity";

type SortDir = "asc" | "desc";

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function SchoolsPage() {
  const [rows, setRows] = useState<SchoolAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("contacts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setLoading(true);
    setErr(null);

    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);

    const res = await fetchWithAuth(`/api/schools/accounts?${params.toString()}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load school accounts");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json?.data ?? []) as SchoolAccountRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">School Accounts</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Schools as account objects with penetration, cadence coverage, rep ownership, and recent activity.
          </div>
        </div>

        <button className="rounded-xl border px-4 py-2" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <input
          className="rounded-xl border px-4 py-3"
          placeholder="Search school or rep..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="rounded-xl border px-4 py-3"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
        >
          <option value="contacts">Sort by Contacts</option>
          <option value="penetration">Sort by Penetration</option>
          <option value="cadence_coverage">Sort by Cadence Coverage</option>
          <option value="last_activity">Sort by Last Activity</option>
          <option value="tier">Sort by Tier</option>
          <option value="name">Sort by Name</option>
        </select>

        <select
          className="rounded-xl border px-4 py-3"
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as SortDir)}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>

        <button
          className="rounded-xl border px-4 py-3"
          onClick={() => void load()}
        >
          Apply
        </button>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading school accounts...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border p-6 text-muted-foreground">
          No schools found.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/schools/${row.id}`}
              className="block rounded-2xl border p-5 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xl font-semibold">{row.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Tier {row.tier ?? "—"} • {row.total_contacts} contacts • {row.rep_count} rep(s)
                  </div>

                  <div className="mt-2 text-sm text-muted-foreground">
                    Reps: {row.reps_assigned.length ? row.reps_assigned.map((r) => r.name).join(", ") : "None"}
                  </div>

                  <div className="mt-2 text-sm text-muted-foreground">
                    Last activity: {formatDateTime(row.last_activity_at)}
                  </div>
                </div>

                <div className="grid min-w-[320px] grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Pipeline Penetration</div>
                    <div className="mt-1 text-2xl font-semibold">{row.pipeline_penetration_score}%</div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Cadence Coverage</div>
                    <div className="mt-1 text-2xl font-semibold">{row.cadence_coverage}%</div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">New</div>
                    <div className="mt-1 text-lg font-semibold">{row.new_count}</div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Secured/Active</div>
                    <div className="mt-1 text-lg font-semibold">{row.secured_active_count}</div>
                  </div>
                </div>
              </div>

              {row.recent_contacts.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {row.recent_contacts.map((contact) => (
                    <div key={contact.id} className="rounded-xl border p-3">
                      <div className="font-medium">{contact.full_name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {contact.primary_email || "No email"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {contact.sport || "—"} • {contact.status || "—"} • {contact.cadence_status || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}