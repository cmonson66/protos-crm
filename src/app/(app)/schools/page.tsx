"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function tierTone(tier: number | null) {
  if (tier === 1) return "border-violet-200 bg-violet-50 text-violet-700";
  if (tier === 2) return "border-sky-200 bg-sky-50 text-sky-700";
  if (tier === 3) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function percentageTone(value: number) {
  if (value >= 75) return "text-emerald-700";
  if (value >= 40) return "text-amber-700";
  return "text-slate-700";
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

  const summary = useMemo(() => {
    return {
      totalSchools: rows.length,
      totalContacts: rows.reduce((sum, row) => sum + Number(row.total_contacts || 0), 0),
      securedActive: rows.reduce(
        (sum, row) => sum + Number(row.secured_active_count || 0),
        0
      ),
      activeCadences: rows.reduce(
        (sum, row) => sum + Number(row.active_cadence_count || 0),
        0
      ),
    };
  }, [rows]);

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                School Accounts
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  Athletics Coverage
                </span>

                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  Pipeline Penetration
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {loading ? "Loading..." : `${rows.length} school${rows.length === 1 ? "" : "s"}`}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Schools as account objects with penetration, cadence coverage,
                rep ownership, and recent activity.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="crm-button px-4 py-2"
                onClick={() => void load()}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Schools
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.totalSchools}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total Contacts
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.totalContacts}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Secured / Active
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.securedActive}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active Cadences
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.activeCadences}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Filters</div>
            <div className="mt-1 text-sm text-slate-600">
              Search by school or assigned rep, then sort by coverage and activity.
            </div>
          </div>

          <div className="text-sm text-slate-500">
            {loading ? "Loading..." : `${rows.length} result${rows.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <input
            className="crm-input px-4 py-3"
            placeholder="Search school or rep..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="crm-input px-4 py-3"
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
            className="crm-input px-4 py-3"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>

          <button
            className="crm-button px-4 py-3"
            onClick={() => void load()}
          >
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="crm-card p-6 text-sm text-slate-500">
          Loading school accounts...
        </div>
      ) : rows.length === 0 ? (
        <div className="crm-card p-6 text-sm text-slate-500">
          No schools found.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/schools/${row.id}`}
              className="crm-card block p-6 transition hover:-translate-y-[1px] hover:bg-slate-50/60"
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 xl:flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-2xl font-semibold text-slate-900">
                      {row.name}
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tierTone(
                        row.tier
                      )}`}
                    >
                      Tier {row.tier ?? "—"}
                    </span>
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    {row.total_contacts} contacts • {row.rep_count} rep
                    {row.rep_count === 1 ? "" : "s"}
                  </div>

                  <div className="mt-2 text-sm text-slate-600">
                    Reps:{" "}
                    {row.reps_assigned.length
                      ? row.reps_assigned.map((r) => r.name).join(", ")
                      : "None"}
                  </div>

                  <div className="mt-2 text-sm text-slate-500">
                    Last activity: {formatDateTime(row.last_activity_at)}
                  </div>
                </div>

                <div className="grid min-w-[320px] gap-3 sm:grid-cols-2 xl:w-[420px]">
                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">
                      Pipeline Penetration
                    </div>
                    <div
                      className={`mt-1 text-2xl font-semibold ${percentageTone(
                        row.pipeline_penetration_score
                      )}`}
                    >
                      {row.pipeline_penetration_score}%
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">
                      Cadence Coverage
                    </div>
                    <div
                      className={`mt-1 text-2xl font-semibold ${percentageTone(
                        row.cadence_coverage
                      )}`}
                    >
                      {row.cadence_coverage}%
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">New</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {row.new_count}
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">Secured / Active</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {row.secured_active_count}
                    </div>
                  </div>
                </div>
              </div>

              {row.recent_contacts.length > 0 ? (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {row.recent_contacts.map((contact) => (
                    <div key={contact.id} className="crm-card-soft p-3">
                      <div className="font-medium text-slate-900">
                        {contact.full_name}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {contact.primary_email || "No email"}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {contact.sport || "—"} • {contact.status || "—"} •{" "}
                        {contact.cadence_status || "—"}
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