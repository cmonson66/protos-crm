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
  vertical: "athletics" | "corporate";
  is_active: boolean;
  updated_at: string | null;
};

type PreviewRow = {
  row_number: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  phone: string;
  linkedin_url: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  job_title_raw: string;
  job_function: string;
  management_level: string;
  sport: string;
  division: string;
  conference: string;
  region: string;
  rep_notes: string;
  school_name: string;
  account_name: string;
  account_website: string;
  account_employee_count: string;
  account_industry: string;
  account_address: string;
  account_city: string;
  account_state: string;
  status: string;
  cadence_status: string;
  assigned_to_user_id: string;
  source: string;
  import_batch: string;
  ready: boolean;
  errors: string[];
  warnings: string[];
};

type PreviewResponse = {
  ok: boolean;
  vertical: "athletics" | "corporate";
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

function readinessTone(ready: boolean) {
  return ready
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function statusTone(status: string) {
  if (status === "New") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Secured/Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function ContactsImportPage() {
  const [vertical, setVertical] = useState<"athletics" | "corporate">("athletics");
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

  const previewSummary = useMemo(() => {
    return {
      total: preview?.summary.total_rows ?? 0,
      ready: preview?.summary.ready_count ?? 0,
      errors: preview?.summary.error_count ?? 0,
    };
  }, [preview]);

  const importSummary = useMemo(() => {
    const imported = importResults.filter((x) => x.ok).length;
    const skipped = importResults.filter((x) => !x.ok).length;
    return {
      total: importResults.length,
      imported,
      skipped,
    };
  }, [importResults]);

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
                Import Contacts
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="crm-pill px-3 py-1.5 text-xs font-semibold capitalize">
                  {vertical}
                </span>

                <span
                  className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(
                    status
                  )}`}
                >
                  {status}
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {filteredCadences.length} Cadences
                </span>

                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {autoCreateOrganizations ? "Auto-create orgs" : "No org creation"}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Upload a CSV, preview the import, then commit contacts in bulk.
              </div>
            </div>

            <div className="flex gap-2">
              <Link href="/contacts" className="crm-button px-4 py-2">
                Back to Contacts
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-3 xl:grid-cols-6">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Preview Rows
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {previewSummary.total}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Ready Rows
            </div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">
              {previewSummary.ready}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Preview Errors
            </div>
            <div className="mt-2 text-2xl font-semibold text-rose-700">
              {previewSummary.errors}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Imported
            </div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">
              {importSummary.imported}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Skipped
            </div>
            <div className="mt-2 text-2xl font-semibold text-amber-700">
              {importSummary.skipped}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              File
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-slate-900">
              {fileName || "No file loaded"}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="text-lg font-semibold text-slate-900">Import Settings</div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value as "athletics" | "corporate")}
            className="crm-input px-4 py-3"
          >
            <option value="athletics">Athletics</option>
            <option value="corporate">Corporate</option>
          </select>

          <select
            value={assignedToUserId}
            onChange={(e) => setAssignedToUserId(e.target.value)}
            className="crm-input px-4 py-3"
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
            className="crm-input px-4 py-3"
          >
            <option value="New">New</option>
            <option value="Secured/Active">Secured/Active</option>
            <option value="Closed/Do Not Contact">Closed/Do Not Contact</option>
          </select>

          <select
            value={cadenceKey}
            onChange={(e) => setCadenceKey(e.target.value)}
            className="crm-input px-4 py-3"
          >
            <option value="">No cadence on import</option>
            {filteredCadences.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({c.key})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={autoCreateOrganizations}
              onChange={(e) => setAutoCreateOrganizations(e.target.checked)}
            />
            <span className="text-sm text-slate-700">Auto-create missing orgs</span>
          </label>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="text-lg font-semibold text-slate-900">CSV Upload</div>

        <div className="mt-2 text-sm text-slate-600">
          Required columns: first_name/last_name/email, and{" "}
          {vertical === "athletics" ? "school_name + sport" : "account_name"}.
        </div>

        <div className="mt-1 text-xs text-slate-500">
          Supported optional columns: phone, linkedin_url, address, city, state, zip,
          website, job_title_raw, job_function, management_level, division,
          conference, region, rep_notes, source, import_batch.
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
            className="crm-input px-4 py-3"
          />

          <button
            onClick={() => void runPreview()}
            disabled={previewing || importing || loading}
            className="crm-button px-5 py-3 disabled:opacity-50"
          >
            {previewing ? "Previewing..." : "Preview Import"}
          </button>

          <button
            onClick={() => void runImport()}
            disabled={importing || previewing || loading}
            className="crm-button-primary px-5 py-3 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import Contacts"}
          </button>
        </div>

        {fileName ? (
          <div className="mt-3 text-sm text-slate-500">
            Loaded file: <span className="font-semibold text-slate-900">{fileName}</span>
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="crm-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold text-slate-900">Preview</div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                Rows: {preview.summary.total_rows}
              </span>
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Ready: {preview.summary.ready_count}
              </span>
              <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                Errors: {preview.summary.error_count}
              </span>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[2200px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-3 pr-4">Row</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Phone</th>
                  <th className="py-3 pr-4">LinkedIn</th>
                  <th className="py-3 pr-4">Job Title</th>
                  <th className="py-3 pr-4">Job Function</th>
                  <th className="py-3 pr-4">Mgmt Level</th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "School" : "Account"}
                  </th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "Sport" : "Industry"}
                  </th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "Region" : "Employees"}
                  </th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "Website" : "Account Website"}
                  </th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "Address" : "Account Address"}
                  </th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "City" : "Account City"}
                  </th>
                  <th className="py-3 pr-4">
                    {vertical === "athletics" ? "State" : "Account State"}
                  </th>
                  <th className="py-3 pr-4">Ready</th>
                  <th className="py-3 pr-4">Issues</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row_number} className="border-b border-slate-200 align-top">
                    <td className="py-3 pr-4 text-slate-700">{row.row_number}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900">
                      {`${row.first_name || ""} ${row.last_name || ""}`.trim() || "—"}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{row.primary_email || "—"}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.phone || "—"}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.linkedin_url || "—"}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.job_title_raw || "—"}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.job_function || "—"}</td>
                    <td className="py-3 pr-4 text-slate-700">{row.management_level || "—"}</td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.school_name || "—"
                        : row.account_name || "—"}
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.sport || "—"
                        : row.account_industry || "—"}
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.region || "—"
                        : row.account_employee_count || "—"}
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.website || "—"
                        : row.account_website || "—"}
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.address || "—"
                        : row.account_address || "—"}
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.city || "—"
                        : row.account_city || "—"}
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {vertical === "athletics"
                        ? row.state || "—"
                        : row.account_state || "—"}
                    </td>

                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${readinessTone(
                          row.ready
                        )}`}
                      >
                        {row.ready ? "Ready" : "Blocked"}
                      </span>
                    </td>

                    <td className="py-3 pr-4">
                      <div className="space-y-1">
                        {row.errors.map((x, i) => (
                          <div key={`e-${i}`} className="text-sm text-rose-600">
                            {x}
                          </div>
                        ))}
                        {row.warnings.map((x, i) => (
                          <div key={`w-${i}`} className="text-sm text-amber-600">
                            {x}
                          </div>
                        ))}
                        {row.errors.length === 0 && row.warnings.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : null}
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
        <div className="crm-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold text-slate-900">Import Results</div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Imported: {importSummary.imported}
              </span>
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Skipped: {importSummary.skipped}
              </span>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-3 pr-4">Row</th>
                  <th className="py-3 pr-4">Result</th>
                  <th className="py-3 pr-4">Message</th>
                  <th className="py-3 pr-4">Contact</th>
                </tr>
              </thead>
              <tbody>
                {importResults.map((row) => (
                  <tr key={row.row_number} className="border-b border-slate-200">
                    <td className="py-3 pr-4 text-slate-700">{row.row_number}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${readinessTone(
                          row.ok
                        )}`}
                      >
                        {row.ok ? "Imported" : "Skipped"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{row.message}</td>
                    <td className="py-3 pr-4">
                      {row.contact_id ? (
                        <Link
                          href={`/contacts/${row.contact_id}`}
                          className="crm-button px-3 py-2 text-xs"
                        >
                          Open Contact
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
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