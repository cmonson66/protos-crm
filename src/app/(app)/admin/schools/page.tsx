"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type DuplicateSchool = {
  id: string;
  name: string;
  tier: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  contact_count: number;
};

type DuplicateGroup = {
  normalized_name: string;
  target_school_id: string;
  target_school_name: string;
  total_contacts: number;
  schools: DuplicateSchool[];
};

type HealthData = {
  total_schools: number;
  duplicate_groups: number;
  schools_with_no_contacts: number;
  schools_with_10_plus_contacts: number;
  schools_with_50_plus_contacts: number;
  top_schools: Array<{
    id: string;
    name: string;
    tier: number | null;
    contact_count: number;
  }>;
};

function tierTone(tier: number | null) {
  if (tier === 1) return "border-violet-200 bg-violet-50 text-violet-700";
  if (tier === 2) return "border-sky-200 bg-sky-50 text-sky-700";
  if (tier === 3) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function AdminSchoolsPage() {
  const [loading, setLoading] = useState(true);
  const [busyGroupKey, setBusyGroupKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [targetByGroup, setTargetByGroup] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadAll() {
    setLoading(true);
    setErr(null);

    const [dupRes, healthRes] = await Promise.all([
      fetchWithAuth("/api/admin/schools/duplicates"),
      fetchWithAuth("/api/admin/schools/health"),
    ]);

    const dupJson = await dupRes.json().catch(() => ({}));
    const healthJson = await healthRes.json().catch(() => ({}));

    if (!dupRes.ok) {
      setErr(dupJson?.error ?? "Failed to load duplicate schools");
      setGroups([]);
      setLoading(false);
      return;
    }

    if (!healthRes.ok) {
      setErr(healthJson?.error ?? "Failed to load school health");
      setHealth(null);
      setLoading(false);
      return;
    }

    const duplicateData = (dupJson?.data ?? []) as DuplicateGroup[];
    const healthData = (healthJson?.data ?? null) as HealthData | null;

    setGroups(duplicateData);
    setHealth(healthData);

    const initialTargets: Record<string, string> = {};
    for (const group of duplicateData) {
      initialTargets[group.normalized_name] = group.target_school_id;
    }
    setTargetByGroup(initialTargets);

    setLoading(false);
  }

  async function mergeGroup(group: DuplicateGroup) {
    const groupKey = group.normalized_name;
    const target_school_id = targetByGroup[groupKey] || group.target_school_id;

    const source_school_ids = group.schools
      .map((s) => s.id)
      .filter((id) => id !== target_school_id);

    if (!target_school_id || source_school_ids.length === 0) {
      setErr("Pick a target school and at least one duplicate source.");
      return;
    }

    setBusyGroupKey(groupKey);
    setErr(null);

    const res = await fetchWithAuth("/api/admin/schools/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_school_id,
        source_school_ids,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "School merge failed");
      setBusyGroupKey(null);
      return;
    }

    const result = json?.result ?? {};
    setToast(
      `Merged ${result?.deleted_schools ?? source_school_ids.length} school record(s) and reassigned ${result?.reassigned_contacts ?? 0} contact(s)`
    );

    setBusyGroupKey(null);
    await loadAll();
  }

  const totalDuplicateSchools = useMemo(() => {
    return groups.reduce((sum, g) => sum + g.schools.length, 0);
  }, [groups]);

  return (
    <div className="space-y-8 p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{toast}</div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                School Health Dashboard
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  Duplicate Cleanup
                </span>

                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  Canonical Merge Control
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {loading ? "Loading..." : `${groups.length} duplicate group${groups.length === 1 ? "" : "s"}`}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Monitor school data quality, spot duplicate records, and merge
                them safely.
              </div>
            </div>

            <div className="flex gap-2">
              <button className="crm-button px-4 py-2" onClick={() => void loadAll()}>
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-5">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total Schools
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {health?.total_schools ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Duplicate Groups
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {health?.duplicate_groups ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              No Contacts
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {health?.schools_with_no_contacts ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              10+ Contacts
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {health?.schools_with_10_plus_contacts ?? 0}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              50+ Contacts
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {health?.schools_with_50_plus_contacts ?? 0}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="crm-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                Duplicate Cleanup Console
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Resolve duplicate school records by selecting one canonical target.
              </div>
            </div>

            <div className="text-sm text-slate-500">
              {groups.length} duplicate group{groups.length === 1 ? "" : "s"} •{" "}
              {totalDuplicateSchools} school record{totalDuplicateSchools === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-slate-500">
              Loading duplicate schools...
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No duplicate school groups found.
            </div>
          ) : (
            <div className="mt-5 space-y-6">
              {groups.map((group) => {
                const selectedTarget =
                  targetByGroup[group.normalized_name] || group.target_school_id;

                const selectedTargetRow =
                  group.schools.find((s) => s.id === selectedTarget) ?? group.schools[0];

                const sources = group.schools.filter((s) => s.id !== selectedTarget);

                return (
                  <div key={group.normalized_name} className="crm-card-soft p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">
                            {selectedTargetRow?.name || group.target_school_name}
                          </div>

                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            {group.schools.length} records
                          </span>

                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                            {group.total_contacts} linked contacts
                          </span>
                        </div>

                        <div className="mt-2 text-xs text-slate-500">
                          Normalized key: {group.normalized_name}
                        </div>
                      </div>

                      <button
                        className="crm-button px-4 py-2 disabled:opacity-50"
                        disabled={busyGroupKey === group.normalized_name || sources.length === 0}
                        onClick={() => void mergeGroup(group)}
                      >
                        {busyGroupKey === group.normalized_name ? "Merging..." : "Merge Group"}
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium text-slate-700">
                        Choose canonical target school
                      </div>

                      <select
                        className="crm-input w-full px-3 py-2"
                        value={selectedTarget}
                        onChange={(e) =>
                          setTargetByGroup((prev) => ({
                            ...prev,
                            [group.normalized_name]: e.target.value,
                          }))
                        }
                      >
                        {group.schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name} • {school.contact_count} contact(s)
                            {school.tier ? ` • Tier ${school.tier}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {group.schools.map((school) => {
                        const isTarget = school.id === selectedTarget;

                        return (
                          <div
                            key={school.id}
                            className={`rounded-xl border p-4 ${
                              isTarget
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{school.name}</div>

                              <div
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  isTarget
                                    ? "border-emerald-300 bg-white text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {isTarget ? "TARGET" : "SOURCE"}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tierTone(
                                  school.tier
                                )}`}
                              >
                                Tier {school.tier ?? "—"}
                              </span>

                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {school.contact_count} contact{school.contact_count === 1 ? "" : "s"}
                              </span>
                            </div>

                            <div className="mt-3 space-y-1 text-sm text-slate-500">
                              <div className="break-all">ID: {school.id}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="crm-card p-6">
            <div className="text-lg font-semibold text-slate-900">
              Top Schools By Contacts
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-slate-500">Loading school health...</div>
            ) : !health?.top_schools?.length ? (
              <div className="mt-4 text-sm text-slate-500">No schools found.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {health.top_schools.map((school, idx) => (
                  <div key={school.id} className="crm-card-soft p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">
                          {idx + 1}. {school.name}
                        </div>

                        <div className="mt-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tierTone(
                              school.tier
                            )}`}
                          >
                            Tier {school.tier ?? "—"}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-900">
                        {school.contact_count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="crm-card p-6">
            <div className="text-lg font-semibold text-slate-900">
              What this page is for
            </div>

            <div className="mt-4 space-y-2">
              {[
                "Find school duplicates caused by casing, punctuation, and spacing differences",
                "Choose the best canonical school record",
                "Reassign all linked contacts safely before deleting duplicate school rows",
                "Keep your contact-level reporting and school-level analytics clean",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}