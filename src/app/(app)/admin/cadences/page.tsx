"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type CadenceVertical = "coaching" | "corporate";

type CadenceListRow = {
  cadence_key: string;
  vertical: CadenceVertical;
  total_steps: number;
  active_steps: number;
  first_subject: string | null;
  updated_hint: string | null;
};

export default function AdminCadencesPage() {
  const [rows, setRows] = useState<CadenceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [newCadenceKey, setNewCadenceKey] = useState("");
  const [newCadenceVertical, setNewCadenceVertical] =
    useState<CadenceVertical>("coaching");

const [duplicateSource, setDuplicateSource] = useState("");
const [duplicateTarget, setDuplicateTarget] = useState("");
const [duplicateVertical, setDuplicateVertical] =
  useState<CadenceVertical>("coaching");
const [deleteBusyKey, setDeleteBusyKey] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth("/api/admin/cadences");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load cadences");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as CadenceListRow[]);
    setLoading(false);
  }

  async function createCadence() {
    const cadence_key = newCadenceKey.trim();

    if (!cadence_key) {
      setErr("Enter a cadence key.");
      return;
    }

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/admin/cadences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cadence_key,
        vertical: newCadenceVertical,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to create cadence");
      setBusy(false);
      return;
    }

    setNewCadenceKey("");
    setNewCadenceVertical("coaching");
    setToast("Cadence created");
    setBusy(false);
    await load();
    window.location.assign(`/admin/cadences/${json.cadence_key}`);
  }

  async function duplicateCadence() {
    if (!duplicateSource.trim() || !duplicateTarget.trim()) {
      setErr("Choose a source cadence and enter a new cadence key.");
      return;
    }

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/admin/cadences/duplicate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_cadence_key: duplicateSource.trim(),
        new_cadence_key: duplicateTarget.trim(),
        vertical: duplicateVertical,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to duplicate cadence");
      setBusy(false);
      return;
    }

    setDuplicateSource("");
    setDuplicateTarget("");
    setDuplicateVertical("coaching");
    setToast("Cadence duplicated");
    setBusy(false);
    await load();
  }

  async function deleteCadence(cadenceKey: string) {
    const confirmed = window.confirm(
      `Delete cadence "${cadenceKey}"?\n\nThis will permanently remove the cadence and its steps. This cannot be undone.`
    );

    if (!confirmed) return;

    setDeleteBusyKey(cadenceKey);
    setErr(null);

    const res = await fetchWithAuth("/api/admin/cadences/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cadence_key: cadenceKey }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to delete cadence");
      setDeleteBusyKey(null);
      return;
    }

    setToast("Cadence deleted");
    setDeleteBusyKey(null);
    await load();
  }

  const coachingRows = rows.filter((r) => r.vertical === "coaching");
  const corporateRows = rows.filter((r) => r.vertical === "corporate");

  return (
    <div>
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-4xl font-semibold">Admin Cadences</h1>
        <button onClick={() => load()} className="rounded-xl border px-5 py-3">
          Refresh
        </button>
      </div>

      {err ? <div className="mt-6 text-red-600">{err}</div> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Create New Cadence</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Creates a new cadence shell with step 1.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_140px]">
            <input
              value={newCadenceKey}
              onChange={(e) => setNewCadenceKey(e.target.value)}
              placeholder="example: protos_prospecting_v2"
              className="rounded-xl border px-4 py-3"
            />

            <select
              value={newCadenceVertical}
              onChange={(e) =>
                setNewCadenceVertical(e.target.value as CadenceVertical)
              }
              className="rounded-xl border px-4 py-3"
            >
              <option value="coaching">Coaching</option>
              <option value="corporate">Corporate</option>
            </select>

            <button
              disabled={busy}
              onClick={createCadence}
              className="rounded-xl border px-5 py-3 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>

        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Duplicate Cadence</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Clone an existing cadence to a new key for testing or iteration.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              value={duplicateSource}
              onChange={(e) => setDuplicateSource(e.target.value)}
              className="rounded-xl border px-4 py-3"
            >
              <option value="">Select source cadence</option>
              {rows.map((row) => (
                <option key={row.cadence_key} value={row.cadence_key}>
                  {row.cadence_key} ({row.vertical})
                </option>
              ))}
            </select>

            <input
              value={duplicateTarget}
              onChange={(e) => setDuplicateTarget(e.target.value)}
              placeholder="example: protos_prospecting_v3"
              className="rounded-xl border px-4 py-3"
            />

            <select
              value={duplicateVertical}
              onChange={(e) =>
                setDuplicateVertical(e.target.value as CadenceVertical)
              }
              className="rounded-xl border px-4 py-3"
            >
              <option value="coaching">Coaching</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>

          <div className="mt-4">
            <button
              disabled={busy}
              onClick={duplicateCadence}
              className="rounded-xl border px-5 py-3 disabled:opacity-50"
            >
              Duplicate
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-8">
        <div className="rounded-2xl border overflow-hidden">
          <div className="border-b bg-slate-50 p-4 text-lg font-semibold">
            Coaching Cadences
          </div>

          <div className="grid grid-cols-[1.5fr_130px_110px_1.8fr_160px] border-b bg-slate-50">
            <div className="p-3 text-sm font-semibold border-r">Cadence Key</div>
            <div className="p-3 text-sm font-semibold border-r">Vertical</div>
            <div className="p-3 text-sm font-semibold border-r">Steps</div>
            <div className="p-3 text-sm font-semibold border-r">Step 1 Subject</div>
            <div className="p-3 text-sm font-semibold">Actions</div>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-muted-foreground">Loading...</div>
          ) : coachingRows.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              No coaching cadences found.
            </div>
          ) : (
            coachingRows.map((row) => (
              <div
                key={row.cadence_key}
                className="grid grid-cols-[1.5fr_130px_110px_1.8fr_160px] border-b last:border-b-0"
              >
                <div className="p-4 border-r">
                  <div className="font-semibold">{row.cadence_key}</div>
                </div>

                <div className="p-4 border-r text-sm text-muted-foreground capitalize">
                  {row.vertical}
                </div>

                <div className="p-4 border-r text-sm text-muted-foreground">
                  {row.total_steps}
                </div>

                <div className="p-4 border-r text-sm text-muted-foreground">
                  {row.first_subject || "—"}
                </div>

<div className="p-4">
  <div className="flex flex-wrap gap-2">
    <Link
      href={`/admin/cadences/${row.cadence_key}`}
      className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
    >
      Open Editor
    </Link>

    <button
      type="button"
      disabled={deleteBusyKey === row.cadence_key}
      onClick={() => void deleteCadence(row.cadence_key)}
      className="rounded-lg border px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {deleteBusyKey === row.cadence_key ? "Deleting..." : "Delete"}
    </button>
  </div>
</div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl border overflow-hidden">
          <div className="border-b bg-slate-50 p-4 text-lg font-semibold">
            Corporate Cadences
          </div>

          <div className="grid grid-cols-[1.5fr_130px_110px_1.8fr_160px] border-b bg-slate-50">
            <div className="p-3 text-sm font-semibold border-r">Cadence Key</div>
            <div className="p-3 text-sm font-semibold border-r">Vertical</div>
            <div className="p-3 text-sm font-semibold border-r">Steps</div>
            <div className="p-3 text-sm font-semibold border-r">Step 1 Subject</div>
            <div className="p-3 text-sm font-semibold">Actions</div>
          </div>

          {loading ? (
            <div className="p-5 text-sm text-muted-foreground">Loading...</div>
          ) : corporateRows.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              No corporate cadences found.
            </div>
          ) : (
            corporateRows.map((row) => (
              <div
                key={row.cadence_key}
                className="grid grid-cols-[1.5fr_130px_110px_1.8fr_160px] border-b last:border-b-0"
              >
                <div className="p-4 border-r">
                  <div className="font-semibold">{row.cadence_key}</div>
                </div>

                <div className="p-4 border-r text-sm text-muted-foreground capitalize">
                  {row.vertical}
                </div>

                <div className="p-4 border-r text-sm text-muted-foreground">
                  {row.total_steps}
                </div>

                <div className="p-4 border-r text-sm text-muted-foreground">
                  {row.first_subject || "—"}
                </div>

<div className="p-4">
  <div className="flex flex-wrap gap-2">
    <Link
      href={`/admin/cadences/${row.cadence_key}`}
      className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
    >
      Open Editor
    </Link>

    <button
      type="button"
      disabled={deleteBusyKey === row.cadence_key}
      onClick={() => void deleteCadence(row.cadence_key)}
      className="rounded-lg border px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {deleteBusyKey === row.cadence_key ? "Deleting..." : "Delete"}
    </button>
  </div>
</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}