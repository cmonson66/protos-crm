"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  if (loading) {
    return <div className="text-muted-foreground">Loading school account…</div>;
  }

  if (err || !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err || "School not found"}
        </div>
        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => router.push("/schools")}
        >
          Back
        </button>
      </div>
    );
  }

  const { school, metrics, contacts } = data;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">{school.name}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Tier {school.tier ?? "—"} • {metrics.total_contacts} contacts • {metrics.rep_count} rep(s)
          </div>
        </div>

        <div className="flex gap-2">
          <button className="rounded-xl border px-4 py-2" onClick={() => void load()}>
            Refresh
          </button>
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => router.push("/schools")}
          >
            Back
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Pipeline Penetration</div>
          <div className="mt-2 text-3xl font-semibold">{metrics.pipeline_penetration_score}%</div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Cadence Coverage</div>
          <div className="mt-2 text-3xl font-semibold">{metrics.cadence_coverage}%</div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Active Cadence</div>
          <div className="mt-2 text-3xl font-semibold">{metrics.active_cadence_count}</div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Secured/Active</div>
          <div className="mt-2 text-3xl font-semibold">{metrics.secured_active_count}</div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Last Activity</div>
          <div className="mt-2 text-sm font-semibold">{formatDateTime(metrics.last_activity_at)}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Assigned Reps</div>

          <div className="mt-4 space-y-3">
            {metrics.reps_assigned.length === 0 ? (
              <div className="text-sm text-muted-foreground">No reps assigned.</div>
            ) : (
              metrics.reps_assigned.map((rep) => (
                <div key={rep.user_id} className="rounded-xl border p-3">
                  <div className="font-medium">{rep.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">
                    {rep.user_id}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-semibold">Status Mix</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div>New: {metrics.new_count}</div>
              <div>Secured/Active: {metrics.secured_active_count}</div>
              <div>Closed/Do Not Contact: {metrics.do_not_contact_count}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Contacts at This School</div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Contact</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Sport</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Cadence</th>
                  <th className="py-2">Rep</th>
                  <th className="py-2">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={7}>
                      No contacts.
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => (
                    <tr key={contact.id} className="border-t">
                      <td className="py-2">
                        <Link href={`/contacts/${contact.id}`} className="hover:underline">
                          {contact.full_name}
                        </Link>
                      </td>
                      <td className="py-2">{contact.primary_email || "—"}</td>
                      <td className="py-2">{contact.sport || "—"}</td>
                      <td className="py-2">{contact.status || "—"}</td>
                      <td className="py-2">
                        {contact.cadence_status || "—"}
                        {contact.cadence_step > 0 ? ` • Step ${contact.cadence_step}` : ""}
                      </td>
                      <td className="py-2">{contact.assigned_to_name || "Unassigned"}</td>
                      <td className="py-2">{formatDateTime(contact.last_activity_at)}</td>
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