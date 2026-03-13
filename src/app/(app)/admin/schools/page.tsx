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
    <div className="space-y-8">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">School Health Dashboard</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Monitor school data quality, spot duplicate records, and merge them safely.
          </div>
        </div>

        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => void loadAll()}
        >
          Refresh
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Total Schools</div>
          <div className="mt-2 text-3xl font-semibold">
            {health?.total_schools ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Duplicate Groups</div>
          <div className="mt-2 text-3xl font-semibold">
            {health?.duplicate_groups ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Schools With No Contacts</div>
          <div className="mt-2 text-3xl font-semibold">
            {health?.schools_with_no_contacts ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Schools With 10+ Contacts</div>
          <div className="mt-2 text-3xl font-semibold">
            {health?.schools_with_10_plus_contacts ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-xs text-muted-foreground">Schools With 50+ Contacts</div>
          <div className="mt-2 text-3xl font-semibold">
            {health?.schools_with_50_plus_contacts ?? 0}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Duplicate Cleanup Console</div>
            <div className="text-sm text-muted-foreground">
              {groups.length} duplicate group(s) • {totalDuplicateSchools} school record(s)
            </div>
          </div>

          {loading ? (
            <div className="mt-4 text-muted-foreground">Loading duplicate schools...</div>
          ) : groups.length === 0 ? (
            <div className="mt-4 rounded-xl border p-4 text-muted-foreground">
              No duplicate school groups found.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {groups.map((group) => {
                const selectedTarget = targetByGroup[group.normalized_name] || group.target_school_id;
                const selectedTargetRow =
                  group.schools.find((s) => s.id === selectedTarget) ?? group.schools[0];

                const sources = group.schools.filter((s) => s.id !== selectedTarget);

                return (
                  <div key={group.normalized_name} className="rounded-2xl border p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold">
                          {selectedTargetRow?.name || group.target_school_name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Normalized key: {group.normalized_name}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {group.schools.length} school records • {group.total_contacts} linked contacts
                        </div>
                      </div>

                      <button
                        className="rounded-xl border px-4 py-2 disabled:opacity-50"
                        disabled={busyGroupKey === group.normalized_name || sources.length === 0}
                        onClick={() => void mergeGroup(group)}
                      >
                        {busyGroupKey === group.normalized_name ? "Merging..." : "Merge Group"}
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Choose canonical target school</div>
                      <select
                        className="w-full rounded-xl border px-3 py-2"
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

                    <div className="grid gap-3 md:grid-cols-2">
                      {group.schools.map((school) => {
                        const isTarget = school.id === selectedTarget;

                        return (
                          <div
                            key={school.id}
                            className={`rounded-xl border p-4 ${
                              isTarget ? "border-emerald-300 bg-emerald-50" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium">{school.name}</div>
                              <div className="text-xs font-semibold">
                                {isTarget ? "TARGET" : "SOURCE"}
                              </div>
                            </div>

                            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                              <div>Contacts: {school.contact_count}</div>
                              <div>Tier: {school.tier ?? "—"}</div>
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

        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Top Schools By Contacts</div>

          {loading ? (
            <div className="mt-4 text-muted-foreground">Loading school health...</div>
          ) : !health?.top_schools?.length ? (
            <div className="mt-4 text-muted-foreground">No schools found.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {health.top_schools.map((school, idx) => (
                <div key={school.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {idx + 1}. {school.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {school.tier ? `Tier ${school.tier}` : "No tier"}
                      </div>
                    </div>

                    <div className="rounded-full border px-3 py-1 text-sm font-semibold">
                      {school.contact_count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-semibold">What this page is for</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Find school duplicates caused by casing, punctuation, and spacing differences</li>
              <li>Choose the best canonical school record</li>
              <li>Reassign all linked contacts safely before deleting duplicate school rows</li>
              <li>Keep your contact-level reporting and school-level analytics clean</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}