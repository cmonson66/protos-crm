"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type OpportunityDetail = {
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
  commission_paid_total: number;
  commission_paid_rep: number;
  created_at: string;
  updated_at: string;

  school_name: string | null;
  account_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_primary_email: string | null;
};

type OpportunityHistoryRow = {
  id: number;
  opportunity_id: string;
  from_stage_key: string | null;
  to_stage_key: string;
  changed_by_user_id: string | null;
  changed_at: string;
  notes: string | null;
};

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

type MeResponse = {
  role?: "admin" | "manager" | "rep";
  user?: {
    id: string;
    email?: string | null;
  };
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
  return new Date(ts).toLocaleString();
}

function verticalLabel(v: string) {
  return v === "corporate" ? "Corporate" : "Athletics";
}

function stageLabel(stage: string) {
  switch (stage) {
    case "prospecting":
      return "Prospecting";
    case "discovery":
      return "Discovery";
    case "presentation":
      return "Presentation";
    case "contract_signed":
      return "Contract Signed";
    default:
      return stage;
  }
}

function verticalTone(vertical: "athletics" | "corporate") {
  return vertical === "corporate"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-sky-200 bg-sky-50 text-sky-700";
}

function statusTone(status: "open" | "closed_won" | "closed_lost") {
  if (status === "closed_won") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "closed_lost") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const opportunityId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [history, setHistory] = useState<OpportunityHistoryRow[]>([]);
  const [reps, setReps] = useState<RepRow[]>([]);

  const [myRole, setMyRole] = useState<"admin" | "manager" | "rep" | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [salesStageKey, setSalesStageKey] = useState("prospecting");
  const [status, setStatus] = useState("open");
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [actualRevenue, setActualRevenue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [qualifiedMeetingBookedAt, setQualifiedMeetingBookedAt] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [commissionPaidTotal, setCommissionPaidTotal] = useState("");
  const [commissionPaidRep, setCommissionPaidRep] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  function hydrate(data: OpportunityDetail) {
    setOpportunity(data);
    setName(data.name || "");
    setDescription(data.description || "");
    setSalesStageKey(data.sales_stage_key || "prospecting");
    setStatus(data.status || "open");
    setEstimatedRevenue(String(data.estimated_revenue ?? 0));
    setActualRevenue(data.actual_revenue == null ? "" : String(data.actual_revenue));
    setExpectedCloseDate(data.expected_close_date || "");
    setQualifiedMeetingBookedAt(data.qualified_meeting_booked_at || "");
    setAssignedToUserId(data.assigned_to_user_id || "");
    setCommissionPaidTotal(String(data.commission_paid_total ?? 0));
    setCommissionPaidRep(String(data.commission_paid_rep ?? 0));
  }

  async function load() {
    if (!opportunityId) return;

    setLoading(true);
    setErr(null);

    const [detailRes, repsRes, meRes] = await Promise.all([
      fetchWithAuth(`/api/opportunities/${opportunityId}`),
      fetchWithAuth("/api/reps/list"),
      fetchWithAuth("/api/auth/me"),
    ]);

    const detailJson = await detailRes.json().catch(() => ({}));
    const repsJson = await repsRes.json().catch(() => ({}));
    const meJson = (await meRes.json().catch(() => ({}))) as MeResponse;

    if (!detailRes.ok) {
      setErr(detailJson?.error ?? "Failed to load opportunity");
      setLoading(false);
      return;
    }

    hydrate(detailJson.data as OpportunityDetail);
    setHistory((detailJson.history ?? []) as OpportunityHistoryRow[]);

    if (repsRes.ok) {
      setReps((repsJson.data ?? []) as RepRow[]);
    } else {
      setReps([]);
    }

    setMyRole(meRes.ok ? meJson.role ?? "rep" : "rep");
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  const isPrivilegedUser = myRole === "admin" || myRole === "manager";
  const canEditCompensation = isPrivilegedUser;
  const canEditAssignment = isPrivilegedUser;

  const orgName = useMemo(() => {
    if (!opportunity) return "—";
    return opportunity.vertical === "corporate"
      ? opportunity.account_name || "—"
      : opportunity.school_name || "—";
  }, [opportunity]);

  const primaryContactName = useMemo(() => {
    if (!opportunity) return "—";
    const full = `${opportunity.contact_first_name || ""} ${
      opportunity.contact_last_name || ""
    }`.trim();
    return full || opportunity.contact_primary_email || "—";
  }, [opportunity]);

  const assignedRepLabel = useMemo(() => {
    if (!opportunity?.assigned_to_user_id) return "Unassigned";
    const rep = reps.find((r) => r.user_id === opportunity.assigned_to_user_id);
    return rep?.full_name || rep?.email || opportunity.assigned_to_user_id;
  }, [opportunity?.assigned_to_user_id, reps]);

  async function save() {
    if (!opportunityId) return;

    setSaving(true);
    setErr(null);

    const payload: Record<string, unknown> = {
      opportunity_id: opportunityId,
      name,
      description,
      sales_stage_key: salesStageKey,
      status,
      estimated_revenue: Number(estimatedRevenue || 0),
      actual_revenue: actualRevenue === "" ? null : Number(actualRevenue || 0),
      expected_close_date: expectedCloseDate || null,
      qualified_meeting_booked_at: qualifiedMeetingBookedAt || null,
    };

    if (canEditAssignment) {
      payload.assigned_to_user_id = assignedToUserId || null;
    }

    if (canEditCompensation) {
      payload.commission_paid_total = Number(commissionPaidTotal || 0);
      payload.commission_paid_rep = Number(commissionPaidRep || 0);
    }

    const res = await fetchWithAuth("/api/opportunities/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to save opportunity");
      setSaving(false);
      return;
    }

    setToast("Opportunity updated");
    setSaving(false);
    await load();
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="crm-card p-6 text-sm text-slate-500">
          Loading opportunity...
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="space-y-3 p-6">
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err || "Opportunity not found."}
        </div>
        <button
          className="crm-button px-4 py-2"
          onClick={() => router.push("/opportunities")}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{toast}</div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-indigo-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                {opportunity.name}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm ${verticalTone(
                    opportunity.vertical
                  )}`}
                >
                  {verticalLabel(opportunity.vertical)}
                </span>

                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${statusTone(
                    opportunity.status
                  )}`}
                >
                  {opportunity.status}
                </span>

                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  {orgName}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                {primaryContactName}
                {opportunity.contact_primary_email
                  ? ` • ${opportunity.contact_primary_email}`
                  : ""}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="crm-button-primary px-4 py-2"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className="crm-button px-4 py-2"
                onClick={() => router.push("/opportunities")}
              >
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Estimated Revenue
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(opportunity.estimated_revenue)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Weighted Revenue
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(opportunity.weighted_revenue)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Actual Revenue
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {currency(opportunity.actual_revenue)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Stage Probability
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {Math.round(Number(opportunity.stage_probability || 0) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="crm-card p-6 space-y-4">
          <div className="text-lg font-semibold text-slate-900">
            Opportunity Details
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input
              className="crm-input w-full px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              className="crm-input min-h-[120px] w-full px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Stage</label>
              <select
                className="crm-input w-full px-3 py-2"
                value={salesStageKey}
                onChange={(e) => setSalesStageKey(e.target.value)}
              >
                <option value="prospecting">Prospecting (5%)</option>
                <option value="discovery">Discovery (25%)</option>
                <option value="presentation">Presentation (75%)</option>
                <option value="contract_signed">Contract Signed (100%)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select
                className="crm-input w-full px-3 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="closed_won">Closed Won</option>
                <option value="closed_lost">Closed Lost</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Estimated Revenue
              </label>
              <input
                className="crm-input w-full px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                value={estimatedRevenue}
                onChange={(e) => setEstimatedRevenue(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Actual Revenue
              </label>
              <input
                className="crm-input w-full px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                value={actualRevenue}
                onChange={(e) => setActualRevenue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Expected Close Date
              </label>
              <input
                className="crm-input w-full px-3 py-2"
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Qualified Meeting Booked
              </label>
              <input
                className="crm-input w-full px-3 py-2"
                type="datetime-local"
                value={qualifiedMeetingBookedAt}
                onChange={(e) => setQualifiedMeetingBookedAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="crm-card p-6 space-y-4">
          <div className="text-lg font-semibold text-slate-900">
            Assignment & Compensation
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Vertical</div>
            <div className="mt-1 font-semibold text-slate-900">
              {verticalLabel(opportunity.vertical)}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Organization</div>
            <div className="mt-1 font-semibold text-slate-900">{orgName}</div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Primary Contact</div>
            <div className="mt-1 font-semibold text-slate-900">
              {primaryContactName}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {opportunity.contact_primary_email || "No email"}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Assigned Rep
            </label>

            {canEditAssignment ? (
              <select
                className="crm-input w-full px-3 py-2"
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {reps
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name || r.email || r.user_id}
                    </option>
                  ))}
              </select>
            ) : (
              <div className="crm-card-soft px-3 py-2 text-sm font-medium text-slate-700">
                {assignedRepLabel}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Commission Paid Total
              </label>
              <input
                className="crm-input w-full px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                value={commissionPaidTotal}
                onChange={(e) => setCommissionPaidTotal(e.target.value)}
                disabled={!canEditCompensation}
                readOnly={!canEditCompensation}
              />
              {!canEditCompensation ? (
                <div className="text-xs text-slate-500">Manager/admin only.</div>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Commission Paid Rep
              </label>
              <input
                className="crm-input w-full px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                value={commissionPaidRep}
                onChange={(e) => setCommissionPaidRep(e.target.value)}
                disabled={!canEditCompensation}
                readOnly={!canEditCompensation}
              />
              {!canEditCompensation ? (
                <div className="text-xs text-slate-500">Manager/admin only.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="text-lg font-semibold text-slate-900">
          Product & Forecast Context
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Product Family</div>
            <div className="mt-1 font-semibold text-slate-900">
              {opportunity.product_family || "—"}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Product Category</div>
            <div className="mt-1 font-semibold text-slate-900">
              {opportunity.product_category || "—"}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Product Name</div>
            <div className="mt-1 font-semibold text-slate-900">
              {opportunity.custom_product_name || opportunity.product_name || "—"}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Quantity</div>
            <div className="mt-1 font-semibold text-slate-900">
              {opportunity.quantity == null ? "—" : opportunity.quantity}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Requires Approval</div>
            <div className="mt-1 font-semibold text-slate-900">
              {opportunity.requires_approval ? "Yes" : "No"}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Contract Signed At</div>
            <div className="mt-1 font-semibold text-slate-900">
              {fmtDate(opportunity.contract_signed_at)}
            </div>
          </div>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="text-lg font-semibold text-slate-900">Stage History</div>

        <div className="mt-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-sm text-slate-500">No stage history yet.</div>
          ) : (
            history.map((row) => (
              <div key={row.id} className="crm-card-soft p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">
                    {row.from_stage_key
                      ? `${stageLabel(row.from_stage_key)} → ${stageLabel(
                          row.to_stage_key
                        )}`
                      : `Initial Stage: ${stageLabel(row.to_stage_key)}`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(row.changed_at)}
                  </div>
                </div>

                {row.notes ? (
                  <div className="mt-2 text-sm text-slate-700">{row.notes}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}