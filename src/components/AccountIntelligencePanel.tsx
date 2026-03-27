"use client";

import Link from "next/link";

type AccountIntelligenceResponse = {
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
    most_recent_activity_at: string | null;
    most_recent_activity_subject: string | null;
    highest_priority_contact_id: string | null;
    highest_priority_contact_name: string | null;
    highest_priority_score: number;
  };
  buying_committee: {
    total_identified_roles: number;
    roles: {
      economic_buyer: number;
      technical_buyer: number;
      champion: number;
      operator: number;
      unknown: number;
    };
    coverage: {
      has_economic_buyer: boolean;
      has_technical_buyer: boolean;
      has_champion: boolean;
      has_operator: boolean;
    };
  };
  contacts: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string;
    primary_email: string | null;
    job_title_raw: string | null;
    status: string | null;
    cadence_status: string | null;
    cadence_step: number;
    cadence_next_due_at: string | null;
    last_activity_at: string | null;
    updated_at: string | null;
    assigned_to_user_id: string | null;
    priority_score: number;
    momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
    momentum_score: number;
    priority_reason: string;
    buying_committee_role:
      | "economic_buyer"
      | "technical_buyer"
      | "champion"
      | "operator"
      | "unknown";
    buying_committee_role_label: string;
    buying_committee_confidence: "high" | "medium" | "low";
    buying_committee_source: "manual" | "inferred";
    buying_committee_role_override:
      | "economic_buyer"
      | "technical_buyer"
      | "champion"
      | "operator"
      | "unknown"
      | null;
  }[];
  recent_activity: {
    id: string;
    contact_id: string;
    type: string;
    occurred_at: string;
    subject: string | null;
    outcome: string | null;
  }[];
};

function fmtDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function daysSinceLabel(ts: string | null | undefined) {
  if (!ts) return "Never touched";
  const diff = Math.floor(
    (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

function heatTone(score: number) {
  if (score >= 80) return "crm-pill-danger";
  if (score >= 60) return "crm-pill-warning";
  if (score >= 40) return "crm-pill-info";
  return "crm-pill-muted";
}

function momentumTone(label: "Rising" | "Warm" | "Cooling" | "Cold") {
  switch (label) {
    case "Rising":
      return "crm-pill-success";
    case "Warm":
      return "crm-pill-warning";
    case "Cooling":
      return "crm-pill-info";
    default:
      return "crm-pill-muted";
  }
}

function roleTone(role: string, active: boolean) {
  if (!active) return "crm-card-soft";
  if (role === "economic_buyer") return "crm-card-soft border-emerald-200 bg-emerald-50";
  if (role === "technical_buyer") return "crm-card-soft border-violet-200 bg-violet-50";
  if (role === "champion") return "crm-card-soft border-sky-200 bg-sky-50";
  if (role === "operator") return "crm-card-soft border-amber-200 bg-amber-50";
  return "crm-card-soft";
}

type Props = {
  data: AccountIntelligenceResponse | null;
  loading?: boolean;
};

export default function AccountIntelligencePanel({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="crm-card p-6">
        <div className="text-sm text-slate-500">Loading account intelligence...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="crm-card p-6">
        <div className="text-sm text-slate-500">No account intelligence available.</div>
      </div>
    );
  }

  const topContact = data.contacts[0] ?? null;

  return (
    <div className="crm-card p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-900">
            Account Intelligence
          </div>

          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {data.account.name}
          </div>

          <div className="mt-2 text-sm text-slate-600">
            {data.account.industry || "No industry"}
            {data.account.company_size ? ` • ${data.account.company_size}` : ""}
            {data.account.hq_location ? ` • ${data.account.hq_location}` : " • No HQ location"}
          </div>

          {data.account.website ? (
            <div className="mt-2 text-sm text-slate-600">
              <a
                href={data.account.website}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {data.account.website}
              </a>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="crm-card-soft p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Account Heat
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {data.summary.highest_priority_score > 0
                ? Math.max(0, Math.min(100, Math.round(data.summary.highest_priority_score * 0.43)))
                : 0}
            </div>
            <div className="mt-2">
              <span className={`crm-pill px-3 py-1 text-xs font-semibold ${heatTone(
                data.summary.highest_priority_score > 0
                  ? Math.max(0, Math.min(100, Math.round(data.summary.highest_priority_score * 0.43)))
                  : 0
              )}`}>
                {data.summary.highest_priority_score >= 80
                  ? "Hot"
                  : data.summary.highest_priority_score >= 60
                    ? "Warm"
                    : data.summary.highest_priority_score >= 40
                      ? "Cooling"
                      : "Cold"}
              </span>
            </div>
          </div>

          <div className="crm-card-soft p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Highest Priority
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {data.summary.highest_priority_score}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
        <span className="font-semibold text-slate-900">Why this account is moving:</span>
        <span className="ml-2 text-slate-700">
          {[
            data.buying_committee.coverage.has_economic_buyer
              ? "Economic buyer identified"
              : null,
            data.summary.most_recent_activity_at ? "Very recent account activity" : null,
            data.summary.active_cadences > 0
              ? `${data.summary.active_cadences} active cadence${
                  data.summary.active_cadences === 1 ? "" : "s"
                }`
              : null,
          ]
            .filter(Boolean)
            .join(", ") || "Limited active signals"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="crm-card-soft p-4">
          <div className="text-xs text-slate-500">Total Contacts</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {data.summary.total_contacts}
          </div>
        </div>

        <div className="crm-card-soft p-4">
          <div className="text-xs text-slate-500">Active Cadences</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {data.summary.active_cadences}
          </div>
        </div>

        <div className="crm-card-soft p-4">
          <div className="text-xs text-slate-500">Touched Last 7 Days</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {data.summary.touched_last_7_days}
          </div>
        </div>

        <div className="crm-card-soft p-4">
          <div className="text-xs text-slate-500">Stale Contacts</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {data.summary.stale_contacts}
          </div>
        </div>

        <div className="crm-card-soft p-4">
          <div className="text-xs text-slate-500">Secured / Active</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {data.summary.secured_active_contacts}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <div className="text-lg font-semibold text-slate-900">
          Buying Committee Coverage
        </div>

<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <div
    className={`rounded-2xl border p-4 ${
      data.buying_committee.coverage.has_economic_buyer
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white"
    }`}
  >
    <div
      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
        data.buying_committee.coverage.has_economic_buyer
          ? "text-emerald-700"
          : "text-slate-500"
      }`}
    >
      Economic Buyer
    </div>
    <div
      className={`mt-2 text-3xl font-semibold ${
        data.buying_committee.coverage.has_economic_buyer
          ? "text-emerald-900"
          : "text-slate-900"
      }`}
    >
      {data.buying_committee.roles.economic_buyer}
    </div>
  </div>

  <div
    className={`rounded-2xl border p-4 ${
      data.buying_committee.coverage.has_technical_buyer
        ? "border-violet-200 bg-violet-50"
        : "border-slate-200 bg-white"
    }`}
  >
    <div
      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
        data.buying_committee.coverage.has_technical_buyer
          ? "text-violet-700"
          : "text-slate-500"
      }`}
    >
      Technical Buyer
    </div>
    <div
      className={`mt-2 text-3xl font-semibold ${
        data.buying_committee.coverage.has_technical_buyer
          ? "text-violet-900"
          : "text-slate-900"
      }`}
    >
      {data.buying_committee.roles.technical_buyer}
    </div>
  </div>

  <div
    className={`rounded-2xl border p-4 ${
      data.buying_committee.coverage.has_champion
        ? "border-sky-200 bg-sky-50"
        : "border-slate-200 bg-white"
    }`}
  >
    <div
      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
        data.buying_committee.coverage.has_champion
          ? "text-sky-700"
          : "text-slate-500"
      }`}
    >
      Champion
    </div>
    <div
      className={`mt-2 text-3xl font-semibold ${
        data.buying_committee.coverage.has_champion
          ? "text-sky-900"
          : "text-slate-900"
      }`}
    >
      {data.buying_committee.roles.champion}
    </div>
  </div>

  <div
    className={`rounded-2xl border p-4 ${
      data.buying_committee.coverage.has_operator
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white"
    }`}
  >
    <div
      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
        data.buying_committee.coverage.has_operator
          ? "text-amber-700"
          : "text-slate-500"
      }`}
    >
      Operator
    </div>
    <div
      className={`mt-2 text-3xl font-semibold ${
        data.buying_committee.coverage.has_operator
          ? "text-amber-900"
          : "text-slate-900"
      }`}
    >
      {data.buying_committee.roles.operator}
    </div>
  </div>
</div>

        <div className="mt-4 text-sm text-slate-600">
          Identified roles: {data.buying_committee.total_identified_roles} • Unknown:{" "}
          {data.buying_committee.roles.unknown}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div>
          <div className="text-lg font-semibold text-slate-900">
            Buying Committee / Related Contacts
          </div>

          <div className="mt-4 space-y-4">
            {data.contacts.length === 0 ? (
              <div className="crm-card-soft p-4 text-sm text-slate-500">
                No related contacts found.
              </div>
            ) : (
              data.contacts.map((contact) => (
                <div key={contact.id} className="crm-card-soft p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-slate-900">
                          {contact.full_name}
                        </div>

                        <span className="crm-pill crm-pill-info px-2.5 py-1 text-xs font-semibold">
                          {contact.buying_committee_role_label}
                        </span>

                        <span className="crm-pill crm-pill-muted px-2.5 py-1 text-xs font-semibold">
                          {contact.buying_committee_source === "manual" ? "Manual" : "Inferred"}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-slate-600">
                        {contact.job_title_raw || "No title"}
                        {contact.primary_email ? ` • ${contact.primary_email}` : ""}
                      </div>

                      <div className="mt-2 text-sm text-slate-600">
                        {contact.status || "—"} • {contact.cadence_status || "inactive"}
                        {contact.cadence_step > 0 ? ` • Step ${contact.cadence_step}` : ""}
                        {" • "}
                        {daysSinceLabel(contact.last_activity_at)}
                      </div>

                      <div className="mt-2 text-sm text-slate-700">
                        {contact.priority_reason}
                      </div>

                      <div className="mt-4">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="crm-button px-4 py-2 text-sm"
                        >
                          Open Contact
                        </Link>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="crm-pill crm-pill-warning px-3 py-1 text-sm font-semibold">
                        {contact.priority_score}
                      </span>

                      <span
                        className={`crm-pill px-3 py-1 text-xs font-semibold ${momentumTone(
                          contact.momentum_label
                        )}`}
                      >
                        {contact.momentum_label}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-lg font-semibold text-slate-900">Account Momentum</div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Top Contact</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {data.summary.highest_priority_contact_name || "—"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Priority {data.summary.highest_priority_score}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Most Recent Account Activity</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {fmtDateTime(data.summary.most_recent_activity_at)}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {data.summary.most_recent_activity_subject || "—"}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs text-slate-500">Recent Activity Feed</div>

            <div className="mt-4 space-y-3">
              {data.recent_activity.length === 0 ? (
                <div className="text-sm text-slate-500">No recent activity.</div>
              ) : (
                data.recent_activity.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {item.type}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {item.subject || "Activity"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {fmtDateTime(item.occurred_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}