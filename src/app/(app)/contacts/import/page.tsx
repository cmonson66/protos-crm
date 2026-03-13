"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

type CadenceOption = {
  key: string;
  name: string;
  vertical: "coaching" | "corporate";
  is_active: boolean;
  updated_at: string | null;
};

type PreviewRow = {
  row_number: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  phone: string;
  job_title_raw: string;
  sport: string;
  division: string;
  conference: string;
  region: string;
  rep_notes: string;
  school_name: string;
  account_name: string;
  ready: boolean;
  errors: string[];
  warnings: string[];
};

type PreviewResponse = {
  ok: boolean;
  vertical: "coaching" | "corporate";
  summary: {
    total_rows: number;
    ready_count: number;
    error_count: number;
  };
  rows: PreviewRow[];
};

type ImportResult = {
  row_number: number;
  ok: boolean;
  contact_id?: string;
  message: string;
};

export default function ContactsImportPage() {
  const [vertical, setVertical] = useState<"coaching" | "corporate">("coaching");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [status, setStatus] = useState("New");
  const [cadenceKey, setCadenceKey] = useState("");
  const [autoCreateOrganizations, setAutoCreateOrganizations] = useState(true);

  const [reps, setReps] = useState<RepRow[]>([]);
  const [cadenceOptions, setCadenceOptions] = useState<CadenceOption[]>([]);

  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    void loadMeta();
  }, []);

  useEffect(() => {
    setCadenceKey("");
  }, [vertical]);

  async function loadMeta() {
    setLoading(true);

    const [repsRes, cadenceRes] = await Promise.all([
      fetchWithAuth("/api/reps/list"),
      fetchWithAuth("/api/cadence/list"),
    ]);

    const repsJson = await repsRes.json().catch(() => ({}));
    const cadenceJson = await cadenceRes.json().catch(() => ({}));

    if (repsRes.ok) {
      setReps(((repsJson.data ?? []) as RepRow[]).filter((r) => r.is_active));
    }

    if (cadenceRes.ok) {
      setCadenceOptions((cadenceJson.data ?? []) as CadenceOption[]);
    }

    setLoading(false);
  }

  const filteredCadences = useMemo(() => {
    return cadenceOptions.filter((c) => c.vertical === vertical);
  }, [cadenceOptions, vertical]);

  async function handleFileChange(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setPreview(null);
    setImportResults([]);
    setErr(null);
  }

  async function runPreview() {
    if (!csvText.trim()) {
      setErr("Choose a CSV file first.");
      return;
    }

    setPreviewing(true);
    setErr(null);
    setImportResults([]);

    const res = await fetchWithAuth("/api/contacts/import-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv_text: csvText,
        vertical,
        assigned_to_user_id: assignedToUserId || null,
        status,
        cadence_key: cadenceKey || null,
        auto_create_organizations: autoCreateOrganizations,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Preview failed");
      setPreview(null);
      setPreviewing(false);
      return;
    }

    setPreview(json as PreviewResponse);
    setPreviewing(false);
    setToast("Preview ready");
  }

  async function runImport() {
    if (!csvText.trim()) {
      setErr("Choose a CSV file first.");
      return;
    }

    setImporting(true);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv_text: csvText,
        vertical,
        assigned_to_user_id: assignedToUserId || null,
        status,
        cadence_key: cadenceKey || null,
        auto_create_organizations: autoCreateOrganizations,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Import failed");
      setImporting(false);
      return;
    }

    setImportResults((json.results ?? []) as ImportResult[]);
    setImporting(false);
    setToast("Import complete");
  }

  return (
    <div className="space-y-8">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">Import Contacts</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Upload a CSV, preview the import, then commit contacts in bulk.
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/contacts" className="rounded-xl border px-4 py-2">
            Back to Contacts
          </Link>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Import Settings</div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value as "coaching" | "corporate")}
            className="rounded-xl border px-4 py-3"
          >
            <option value="coaching">Coaching</option>
            <option value="corporate">Corporate</option>
          </select>

          <select
            value={assignedToUserId}
            onChange={(e) => setAssignedToUserId(e.target.value)}
            className="rounded-xl border px-4 py-3"
          >
            <option value="">Assign to rep...</option>
            {reps.map((r) => (
              <option key={r.user_id} value={r.user_id}>
                {r.full_name || r.email || r.user_id}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border px-4 py-3"
          >
            <option value="New">New</option>
            <option value="Secured/Active">Secured/Active</option>
            <option value="Closed/Do Not Contact">Closed/Do Not Contact</option>
          </select>

          <select
            value={cadenceKey}
            onChange={(e) => setCadenceKey(e.target.value)}
            className="rounded-xl border px-4 py-3"
          >
            <option value="">No cadence on import</option>
            {filteredCadences.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({c.key})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <input
              type="checkbox"
              checked={autoCreateOrganizations}
              onChange={(e) => setAutoCreateOrganizations(e.target.checked)}
            />
            <span className="text-sm">Auto-create missing orgs</span>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">CSV Upload</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Required columns: first_name/last_name/email, sport, and{" "}
          {vertical === "coaching" ? "school_name" : "account_name"}.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
            className="rounded-xl border px-4 py-3"
          />

          <button
            onClick={() => void runPreview()}
            disabled={previewing || importing || loading}
            className="rounded-xl border px-5 py-3"
          >
            {previewing ? "Previewing..." : "Preview Import"}
          </button>

          <button
            onClick={() => void runImport()}
            disabled={importing || previewing || loading}
            className="rounded-xl border px-5 py-3"
          >
            {importing ? "Importing..." : "Import Contacts"}
          </button>
        </div>

        {fileName ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Loaded file: <span className="font-semibold">{fileName}</span>
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="rounded-2xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Preview</div>
            <div className="text-sm text-muted-foreground">
              Rows: {preview.summary.total_rows} • Ready: {preview.summary.ready_count} • Errors:{" "}
              {preview.summary.error_count}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1400px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pr-4">Row</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">{vertical === "coaching" ? "School" : "Account"}</th>
                  <th className="py-3 pr-4">Sport / Focus</th>
                  <th className="py-3 pr-4">Ready</th>
                  <th className="py-3 pr-4">Issues</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row_number} className="border-b">
                    <td className="py-3 pr-4">{row.row_number}</td>
                    <td className="py-3 pr-4">
                      {`${row.first_name || ""} ${row.last_name || ""}`.trim() || "—"}
                    </td>
                    <td className="py-3 pr-4">{row.primary_email || "—"}</td>
                    <td className="py-3 pr-4">
                      {vertical === "coaching" ? row.school_name || "—" : row.account_name || "—"}
                    </td>
                    <td className="py-3 pr-4">{row.sport || "—"}</td>
                    <td className="py-3 pr-4">{row.ready ? "Yes" : "No"}</td>
                    <td className="py-3 pr-4">
                      <div className="space-y-1">
                        {row.errors.map((x, i) => (
                          <div key={`e-${i}`} className="text-red-600">
                            {x}
                          </div>
                        ))}
                        {row.warnings.map((x, i) => (
                          <div key={`w-${i}`} className="text-amber-600">
                            {x}
                          </div>
                        ))}
                        {row.errors.length === 0 && row.warnings.length === 0 ? "—" : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {importResults.length > 0 ? (
        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Import Results</div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pr-4">Row</th>
                  <th className="py-3 pr-4">Result</th>
                  <th className="py-3 pr-4">Message</th>
                  <th className="py-3 pr-4">Contact</th>
                </tr>
              </thead>
              <tbody>
                {importResults.map((row) => (
                  <tr key={row.row_number} className="border-b">
                    <td className="py-3 pr-4">{row.row_number}</td>
                    <td className="py-3 pr-4">{row.ok ? "Imported" : "Skipped"}</td>
                    <td className="py-3 pr-4">{row.message}</td>
                    <td className="py-3 pr-4">
                      {row.contact_id ? (
                        <Link
                          href={`/contacts/${row.contact_id}`}
                          className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                        >
                          Open Contact
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
