"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type OpportunityRow = {
  id: string;
  vertical: "athletics" | "corporate";
  school_id: string | null;
  account_id: string | null;
  primary_contact_id: string | null;
  owner_user_id: string | null;
  assigned_to_user_id: string | null;
  name: string;
  description: string | null;
  sales_stage_key: string;
  sales_stage_label: string | null;
  stage_order: number | null;
  config_stage_probability: number | null;
  stage_probability: number;
  status: "open" | "closed_won" | "closed_lost";
  estimated_revenue: number;
  weighted_revenue: number;
  actual_revenue: number | null;
  expected_close_date: string | null;
  contract_signed_at: string | null;
  qualified_meeting_booked_at: string | null;
  sales_cycle_days: number;
  product_catalog_id: number | null;
  product_family: string | null;
  product_category: string | null;
  product_subcategory: string | null;
  product_name: string | null;
  quantity: number | null;
  custom_product_name: string | null;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;

  school_name: string | null;
  account_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_primary_email: string | null;

  catalog_family: string | null;
  catalog_category: string | null;
  catalog_subcategory: string | null;
  catalog_item_name: string | null;
};

type MeResponse = {
  user_id: string;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
};

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

function currency(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString();
}

function fmtDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function verticalLabel(v: string) {
  return v === "corporate" ? "Corporate" : "Athletics";
}

function orgLabel(row: OpportunityRow) {
  return row.vertical === "corporate"
    ? row.account_name || "—"
    : row.school_name || "—";
}

function productLabel(row: OpportunityRow) {
  const bits = [
    row.product_family,
    row.product_category,
    row.product_subcategory,
    row.product_name || row.catalog_item_name,
  ].filter(Boolean);

  if (row.custom_product_name) bits.push(`Custom: ${row.custom_product_name}`);
  return bits.length ? bits.join(" • ") : "—";
}

function verticalTone(vertical: "athletics" | "corporate") {
  return vertical === "corporate"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-sky-200 bg-sky-50 text-sky-700";
}

function statusTone(status: OpportunityRow["status"]) {
  if (status === "closed_won") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "closed_lost") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function OpportunitiesPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("");
  const [salesStageKey, setSalesStageKey] = useState("");
  const [status, setStatus] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");

  const canFilterByRep = me?.role === "admin" || me?.role === "manager";

  async function loadMe() {
    const res = await fetchWithAuth("/api/auth/me");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setMe(json as MeResponse);
  }

  async function loadReps() {
    const res = await fetchWithAuth("/api/reps/list");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setReps((json.data ?? []) as RepRow[]);
  }

  async function load() {
    setLoading(true);
    setErr(null);

    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (vertical) params.set("vertical", vertical);
    if (salesStageKey) params.set("sales_stage_key", salesStageKey);
    if (status) params.set("status", status);
    if (canFilterByRep && assignedToUserId) {
      params.set("assigned_to_user_id", assignedToUserId);
    }

    const res = await fetchWithAuth(
      `/api/opportunities/list?${params.toString()}`
    );
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setRows([]);
      setErr(json?.error ?? "Failed to load opportunities");
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as OpportunityRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadMe();
    void loadReps();
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical, salesStageKey, status, assignedToUserId]);

  const summary = useMemo(() => {
    const openCount = rows.filter((r) => r.status === "open").length;
    const weighted = rows.reduce(
      (sum, r) => sum + Number(r.weighted_revenue || 0),
      0
    );
    const closed = rows.reduce(
      (sum, r) =>
        sum + (r.status === "closed_won" ? Number(r.actual_revenue || 0) : 0),
      0
    );

    return {
      openCount,
      weighted,
      closed,
      total: rows.length,
    };
  }, [rows]);

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-emerald-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                Opportunities
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm">
                  {summary.openCount} open
                </span>

                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm">
                  {currency(summary.weighted)} weighted
                </span>

                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm">
                  {summary.total} total
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Revenue pipeline across Athletics and Corporate.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/opportunities/new"
                className="crm-button-primary px-5 py-3"
              >
                New Opportunity
              </Link>

              <button
                onClick={() => void load()}
                className="crm-button px-5 py-3"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Open Opportunities
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.openCount}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Weighted Pipeline
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(summary.weighted)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Closed Revenue
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(summary.closed)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total Records
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.total}
            </div>
          </div>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Filters</div>
            <div className="mt-1 text-sm text-slate-600">
              Narrow the pipeline by search, vertical, stage, status, or rep.
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search opportunity, org, contact, product..."
              className="crm-input px-4 py-3"
            />

            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="crm-input px-4 py-3"
            >
              <option value="">All verticals</option>
              <option value="athletics">Athletics</option>
              <option value="corporate">Corporate</option>
            </select>

            <select
              value={salesStageKey}
              onChange={(e) => setSalesStageKey(e.target.value)}
              className="crm-input px-4 py-3"
            >
              <option value="">All stages</option>
              <option value="prospecting">Prospecting</option>
              <option value="discovery">Discovery</option>
              <option value="presentation">Presentation</option>
              <option value="contract_signed">Contract Signed</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="crm-input px-4 py-3"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="closed_won">Closed Won</option>
              <option value="closed_lost">Closed Lost</option>
            </select>

            {canFilterByRep ? (
              <select
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                className="crm-input px-4 py-3"
              >
                <option value="">All reps</option>
                {reps
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name || r.email || r.user_id}
                    </option>
                  ))}
              </select>
            ) : (
              <div className="crm-card-soft flex items-center px-4 py-3 text-sm text-slate-500">
                Rep visibility is filtered automatically.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void load()}
              className="crm-button-primary px-5 py-3"
            >
              Apply
            </button>

            <button
              onClick={() => {
                setQ("");
                setVertical("");
                setSalesStageKey("");
                setStatus("");
                setAssignedToUserId("");
                setTimeout(() => void load(), 0);
              }}
              className="crm-button px-5 py-3"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="crm-card p-6 text-sm text-slate-500">
          Loading opportunities...
        </div>
      ) : null}

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Opportunity Table
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Live pipeline view with stage, forecast, and product context.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1600px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4">Opportunity</th>
                <th className="py-3 pr-4">Vertical</th>
                <th className="py-3 pr-4">Organization</th>
                <th className="py-3 pr-4">Stage</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Estimated Revenue</th>
                <th className="py-3 pr-4">Weighted Revenue</th>
                <th className="py-3 pr-4">Actual Revenue</th>
                <th className="py-3 pr-4">Product</th>
                <th className="py-3 pr-4">Expected Close Date</th>
                <th className="py-3 pr-4">Qualified Meeting Booked</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-6 text-slate-500">
                    No opportunities found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="py-4 pr-4 align-top">
                      <Link
                        href={`/opportunities/${row.id}`}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {row.name}
                      </Link>

                      <div className="mt-1 text-xs text-slate-500">
                        {row.contact_first_name || row.contact_last_name
                          ? `${row.contact_first_name || ""} ${
                              row.contact_last_name || ""
                            }`.trim()
                          : row.contact_primary_email || "No primary contact"}
                      </div>
                    </td>

                    <td className="py-4 pr-4 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${verticalTone(
                          row.vertical
                        )}`}
                      >
                        {verticalLabel(row.vertical)}
                      </span>
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-700">
                      {orgLabel(row)}
                    </td>

                    <td className="py-4 pr-4 align-top">
                      <div className="font-medium text-slate-900">
                        {row.sales_stage_label || row.sales_stage_key}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {Math.round(Number(row.stage_probability || 0) * 100)}%
                      </div>
                    </td>

                    <td className="py-4 pr-4 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-900">
                      {currency(row.estimated_revenue)}
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-900">
                      {currency(row.weighted_revenue)}
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-900">
                      {currency(row.actual_revenue)}
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-700">
                      {productLabel(row)}
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-700">
                      {fmtDate(row.expected_close_date)}
                    </td>

                    <td className="py-4 pr-4 align-top text-slate-700">
                      {fmtDateTime(row.qualified_meeting_booked_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}