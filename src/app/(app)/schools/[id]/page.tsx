"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type SchoolDetail = {
  school: {
    id: string;
    name: string;
    tier: number | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  metrics: {
    total_contacts: number;
    rep_count: number;
    reps_assigned: { user_id: string; name: string }[];
    last_activity_at: string | null;
    pipeline_penetration_score: number;
    cadence_coverage: number;
    secured_active_count: number;
    do_not_contact_count: number;
    new_count: number;
    active_cadence_count: number;
  };
  contacts: {
    id: string;
    full_name: string;
    primary_email: string | null;
    sport: string | null;
    status: string | null;
    cadence_status: string | null;
    cadence_step: number;
    assigned_to_user_id: string | null;
    assigned_to_name: string | null;
    last_activity_at: string | null;
    updated_at: string | null;
  }[];
};

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

function statusTone(status: string | null) {
  if (status === "New") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Secured/Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "Closed/Do Not Contact") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function cadenceTone(status: string | null) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "completed") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "stopped") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function percentageTone(value: number) {
  if (value >= 75) return "text-emerald-700";
  if (value >= 40) return "text-amber-700";
  return "text-slate-700";
}

export default function SchoolDetailPage() {
  const params = useParams<{ id: string }>();
  const schoolId = params?.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SchoolDetail | null>(null);

  async function load() {
    if (!schoolId) return;

    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth(`/api/schools/${schoolId}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load school account");
      setData(null);
      setLoading(false);
      return;
    }

    setData((json?.data ?? null) as SchoolDetail | null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const contactSummary = useMemo(() => {
    if (!data) {
      return {
        activeCadence: 0,
        secured: 0,
        newCount: 0,
        doNotContact: 0,
      };
    }

    return {
      activeCadence: data.metrics.active_cadence_count,
      secured: data.metrics.secured_active_count,
      newCount: data.metrics.new_count,
      doNotContact: data.metrics.do_not_contact_count,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="crm-card p-6 text-sm text-slate-500">
          Loading school account...
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="space-y-4 p-6">
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err || "School not found"}
        </div>

        <button
          className="crm-button px-4 py-2"
          onClick={() => router.push("/schools")}
        >
          Back
        </button>
      </div>
    );
  }

  const { school, metrics, contacts } = data;

  return (
    <div className="space-y-8 p-6">
      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-4xl font-semibold tracking-tight text-slate-900">
                  {school.name}
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${tierTone(
                    school.tier
                  )}`}
                >
                  Tier {school.tier ?? "—"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  {metrics.total_contacts} Contacts
                </span>

                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {metrics.rep_count} Rep{metrics.rep_count === 1 ? "" : "s"}
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  Last activity {formatDateTime(metrics.last_activity_at)}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                School-level penetration, cadence coverage, rep assignment,
                and contact execution visibility.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="crm-button px-4 py-2"
                onClick={() => void load()}
              >
                Refresh
              </button>

              <button
                className="crm-button px-4 py-2"
                onClick={() => router.push("/schools")}
              >
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Pipeline Penetration
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${percentageTone(
                metrics.pipeline_penetration_score
              )}`}
            >
              {metrics.pipeline_penetration_score}%
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Cadence Coverage
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${percentageTone(
                metrics.cadence_coverage
              )}`}
            >
              {metrics.cadence_coverage}%
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active Cadence
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {metrics.active_cadence_count}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Secured / Active
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {metrics.secured_active_count}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Last Activity
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatDateTime(metrics.last_activity_at)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <div className="crm-card p-5">
            <div className="text-lg font-semibold text-slate-900">
              Assigned Reps
            </div>

            <div className="mt-4 space-y-3">
              {metrics.reps_assigned.length === 0 ? (
                <div className="text-sm text-slate-500">No reps assigned.</div>
              ) : (
                metrics.reps_assigned.map((rep) => (
                  <div key={rep.user_id} className="crm-card-soft p-3">
                    <div className="font-medium text-slate-900">{rep.name}</div>
                    <div className="mt-1 break-all text-xs text-slate-500">
                      {rep.user_id}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="crm-card p-5">
            <div className="text-lg font-semibold text-slate-900">
              Status Mix
            </div>

            <div className="mt-4 grid gap-3">
              <div className="crm-card-soft p-3">
                <div className="text-xs text-slate-500">New</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {contactSummary.newCount}
                </div>
              </div>

              <div className="crm-card-soft p-3">
                <div className="text-xs text-slate-500">Secured / Active</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {contactSummary.secured}
                </div>
              </div>

              <div className="crm-card-soft p-3">
                <div className="text-xs text-slate-500">Closed / Do Not Contact</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {contactSummary.doNotContact}
                </div>
              </div>

              <div className="crm-card-soft p-3">
                <div className="text-xs text-slate-500">Active Cadence</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {contactSummary.activeCadence}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="crm-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                Contacts at This School
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Contact-level status, cadence state, rep assignment, and recent activity.
              </div>
            </div>

            <div className="text-sm text-slate-500">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-3 pr-4">Contact</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Sport</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Cadence</th>
                  <th className="py-3 pr-4">Rep</th>
                  <th className="py-3">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr>
                    <td className="py-4 text-slate-500" colSpan={7}>
                      No contacts.
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => (
                    <tr key={contact.id} className="border-t border-slate-200">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {contact.full_name}
                        </Link>
                      </td>

                      <td className="py-3 pr-4 text-slate-700">
                        {contact.primary_email || "—"}
                      </td>

                      <td className="py-3 pr-4 text-slate-700">
                        {contact.sport || "—"}
                      </td>

                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(
                            contact.status
                          )}`}
                        >
                          {contact.status || "—"}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${cadenceTone(
                              contact.cadence_status
                            )}`}
                          >
                            {contact.cadence_status || "—"}
                          </span>

                          {contact.cadence_step > 0 ? (
                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                              Step {contact.cadence_step}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3 pr-4 text-slate-700">
                        {contact.assigned_to_name || "Unassigned"}
                      </td>

                      <td className="py-3 text-slate-700">
                        {formatDateTime(contact.last_activity_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}