"use client";

import Link from "next/link";

type BuyingCommitteeRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "operator"
  | "unknown";

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
  heat?: {
    account_heat_score: number;
    account_heat_label: "Hot" | "Warm" | "Cooling" | "Cold";
    account_heat_reason: string;
    breakdown?: { label: string; points: number }[];
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
    buying_committee_role: BuyingCommitteeRole;
    buying_committee_role_label: string;
    buying_committee_confidence: "high" | "medium" | "low";
    buying_committee_source: "manual" | "inferred";
    buying_committee_role_override: BuyingCommitteeRole | null;
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

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function daysSince(ts: string | null) {
  if (!ts) return "Never touched";
  const d = new Date(ts).getTime();
  const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

function momentumStyles(label?: "Rising" | "Warm" | "Cooling" | "Cold") {
  switch (label) {
    case "Rising":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Warm":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cooling":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "Cold":
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function committeeRoleTone(role: BuyingCommitteeRole) {
  switch (role) {
    case "economic_buyer":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "technical_buyer":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "champion":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "operator":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "unknown":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function committeeCoverageTone(covered: boolean) {
  return covered
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
}

function heatTone(label?: "Hot" | "Warm" | "Cooling" | "Cold") {
  switch (label) {
    case "Hot":
      return "border-red-200 bg-red-50 text-red-700";
    case "Warm":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Cooling":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Cold":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default function AccountIntelligencePanel({
  data,
  loading,
}: {
  data: AccountIntelligenceResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Account Intelligence</div>
        <div className="mt-3 text-sm text-muted-foreground">Loading account intelligence…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Account Intelligence</div>
        <div className="mt-3 text-sm text-muted-foreground">
          No account intelligence available.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Account Intelligence</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {data.account.name}
            {data.account.industry ? ` • ${data.account.industry}` : ""}
            {data.account.company_size ? ` • ${data.account.company_size}` : ""}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {data.account.hq_location || "No HQ location"}
            {data.account.website ? ` • ${data.account.website}` : ""}
          </div>
        </div>

        <div className="flex gap-3">
          <div
            className={`rounded-xl border px-4 py-3 text-right ${heatTone(
              data.heat?.account_heat_label
            )}`}
          >
            <div className="text-xs uppercase tracking-wide">Account Heat</div>
            <div className="mt-1 text-2xl font-semibold">
              {data.heat?.account_heat_score ?? 0}
            </div>
            <div className="mt-1 text-xs font-semibold">
              {data.heat?.account_heat_label ?? "Cold"}
            </div>
          </div>

          <div className="rounded-xl border px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Highest Priority
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {data.summary.highest_priority_score}
            </div>
          </div>
        </div>
      </div>

      {data.heat?.account_heat_reason ? (
        <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
          <span className="font-semibold">Why this account is moving:</span>{" "}
          {data.heat.account_heat_reason}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">Total Contacts</div>
          <div className="mt-2 text-2xl font-semibold">{data.summary.total_contacts}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">Active Cadences</div>
          <div className="mt-2 text-2xl font-semibold">{data.summary.active_cadences}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">Touched Last 7 Days</div>
          <div className="mt-2 text-2xl font-semibold">{data.summary.touched_last_7_days}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">Stale Contacts</div>
          <div className="mt-2 text-2xl font-semibold">{data.summary.stale_contacts}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-muted-foreground">Secured / Active</div>
          <div className="mt-2 text-2xl font-semibold">
            {data.summary.secured_active_contacts}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border p-4">
        <div className="text-sm font-semibold">Buying Committee Coverage</div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div
            className={`rounded-xl border px-4 py-3 ${committeeCoverageTone(
              data.buying_committee.coverage.has_economic_buyer
            )}`}
          >
            <div className="text-xs uppercase tracking-wide">Economic Buyer</div>
            <div className="mt-1 text-lg font-semibold">
              {data.buying_committee.roles.economic_buyer}
            </div>
          </div>

          <div
            className={`rounded-xl border px-4 py-3 ${committeeCoverageTone(
              data.buying_committee.coverage.has_technical_buyer
            )}`}
          >
            <div className="text-xs uppercase tracking-wide">Technical Buyer</div>
            <div className="mt-1 text-lg font-semibold">
              {data.buying_committee.roles.technical_buyer}
            </div>
          </div>

          <div
            className={`rounded-xl border px-4 py-3 ${committeeCoverageTone(
              data.buying_committee.coverage.has_champion
            )}`}
          >
            <div className="text-xs uppercase tracking-wide">Champion</div>
            <div className="mt-1 text-lg font-semibold">
              {data.buying_committee.roles.champion}
            </div>
          </div>

          <div
            className={`rounded-xl border px-4 py-3 ${committeeCoverageTone(
              data.buying_committee.coverage.has_operator
            )}`}
          >
            <div className="text-xs uppercase tracking-wide">Operator</div>
            <div className="mt-1 text-lg font-semibold">
              {data.buying_committee.roles.operator}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Identified roles: {data.buying_committee.total_identified_roles} • Unknown:{" "}
          {data.buying_committee.roles.unknown}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div>
          <div className="text-sm font-semibold">Buying Committee / Related Contacts</div>

          <div className="mt-3 space-y-3">
            {data.contacts.length === 0 ? (
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                No related contacts found.
              </div>
            ) : (
              data.contacts.map((contact) => (
                <div key={contact.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold">{contact.full_name}</div>
                        <span
                          className={[
                            "inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold",
                            committeeRoleTone(contact.buying_committee_role),
                          ].join(" ")}
                        >
                          {contact.buying_committee_role_label}
                        </span>

                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
                          {contact.buying_committee_source === "manual" ? "Manual" : "Inferred"}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {contact.job_title_raw || "No title"}
                        {contact.primary_email ? ` • ${contact.primary_email}` : ""}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{contact.status || "—"}</span>
                        <span>•</span>
                        <span>{contact.cadence_status || "—"}</span>
                        {contact.cadence_step > 0 ? (
                          <>
                            <span>•</span>
                            <span>Step {contact.cadence_step}</span>
                          </>
                        ) : null}
                        <span>•</span>
                        <span>{daysSince(contact.last_activity_at)}</span>
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground">
                        {contact.priority_reason || "Priority-ranked contact"}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="rounded-lg border px-3 py-1 text-sm font-semibold">
                        {contact.priority_score}
                      </div>
                      <div
                        className={[
                          "mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                          momentumStyles(contact.momentum_label),
                        ].join(" ")}
                      >
                        {contact.momentum_label}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                    >
                      Open Contact
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold">Account Momentum</div>

          <div className="mt-3 space-y-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Top Contact</div>
              <div className="mt-2 text-sm font-semibold">
                {data.summary.highest_priority_contact_name || "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Priority {data.summary.highest_priority_score}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Most Recent Account Activity</div>
              <div className="mt-2 text-sm font-semibold">
                {formatDateTime(data.summary.most_recent_activity_at)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data.summary.most_recent_activity_subject || "No recent activity subject"}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Recent Activity Feed</div>

              <div className="mt-3 space-y-3">
                {data.recent_activity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No recent activity.</div>
                ) : (
                  data.recent_activity.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {item.type}
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {item.subject || "No subject"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(item.occurred_at)}
                        {item.outcome ? ` • Outcome: ${item.outcome}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}