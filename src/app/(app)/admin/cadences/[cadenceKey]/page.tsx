"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type CadenceStep = {
  cadence_key: string;
  step: number;
  name: string | null;
  subject: string | null;
  body: string | null;
  due_offset_days: number | null;
  required_contact_status: string | null;
  is_active: boolean | null;
};

type CadenceDetailResponse = {
  cadence_key: string;
  steps: CadenceStep[];
  preview: {
    step: number;
    subject: string;
    body: string;
  } | null;
};

const STATUS_OPTIONS = ["", "New", "Secured/Active", "Closed/Do Not Contact"];

export default function AdminCadenceDetailPage() {
  const params = useParams();
  const cadenceKey = String(params?.cadenceKey || "");

  const [steps, setSteps] = useState<CadenceStep[]>([]);
  const [previewStep, setPreviewStep] = useState(1);
  const [preview, setPreview] = useState<CadenceDetailResponse["preview"]>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!cadenceKey) return;
    void load(cadenceKey, previewStep);
  }, [cadenceKey, previewStep]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => Number(a.step) - Number(b.step)),
    [steps]
  );

  async function load(key: string, stepForPreview: number) {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth(
      `/api/admin/cadences/${encodeURIComponent(key)}?preview_step=${stepForPreview}`
    );
    const json = (await res.json().catch(() => ({}))) as
      | CadenceDetailResponse
      | { error?: string };

    if (!res.ok) {
      setErr((json as any)?.error ?? "Failed to load cadence");
      setSteps([]);
      setPreview(null);
      setLoading(false);
      return;
    }

    const data = json as CadenceDetailResponse;
    setSteps(data.steps ?? []);
    setPreview(data.preview ?? null);
    setLoading(false);
  }

  function updateStep(stepNumber: number, patch: Partial<CadenceStep>) {
    setSteps((prev) =>
      prev.map((s) => (s.step === stepNumber ? { ...s, ...patch } : s))
    );
  }

  async function saveAll() {
    setBusy(true);
    setErr(null);

    const payload = sortedSteps.map((s) => ({
      step: Number(s.step),
      name: s.name ?? "",
      subject: s.subject ?? "",
      body: s.body ?? "",
      due_offset_days: Number(s.due_offset_days ?? 0),
      required_contact_status: s.required_contact_status || null,
      is_active: Boolean(s.is_active),
    }));

    const res = await fetchWithAuth(
      `/api/admin/cadences/${encodeURIComponent(cadenceKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          steps: payload,
        }),
      }
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to save cadence");
      setBusy(false);
      return;
    }

    setToast("Cadence saved");
    setBusy(false);
    await load(cadenceKey, previewStep);
  }

  async function addStep() {
    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth(
      `/api/admin/cadences/${encodeURIComponent(cadenceKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add_step" }),
      }
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to add step");
      setBusy(false);
      return;
    }

    setToast("Step added");
    setBusy(false);
    await load(cadenceKey, Number(json?.step || previewStep));
  }

  async function deleteStep(step: number) {
    if (!window.confirm(`Delete step ${step}?`)) return;

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth(
      `/api/admin/cadences/${encodeURIComponent(cadenceKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_step", step }),
      }
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to delete step");
      setBusy(false);
      return;
    }

    setToast("Step deleted");
    setBusy(false);
    setPreviewStep(1);
    await load(cadenceKey, 1);
  }

  return (
    <div>
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Cadence Editor</h1>
          <div className="mt-2 text-sm text-muted-foreground">{cadenceKey}</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => load(cadenceKey, previewStep)}
            className="rounded-xl border px-5 py-3"
          >
            Refresh
          </button>
          <button
            disabled={busy}
            onClick={saveAll}
            className="rounded-xl border px-5 py-3 disabled:opacity-50"
          >
            Save All
          </button>
          <button
            disabled={busy}
            onClick={addStep}
            className="rounded-xl border px-5 py-3 disabled:opacity-50"
          >
            Add Step
          </button>
        </div>
      </div>

      {err ? <div className="mt-6 text-red-600">{err}</div> : null}
      {loading ? <div className="mt-6 text-muted-foreground">Loading...</div> : null}

      {!loading ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_520px]">
          <div className="space-y-4">
            {sortedSteps.map((step) => (
              <div key={step.step} className="rounded-2xl border p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Step {step.step}</div>
                    <div className="text-sm text-muted-foreground">
                      Edit cadence timing, status requirement, and email content.
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewStep(Number(step.step))}
                      className="rounded-lg border px-3 py-2 text-xs"
                    >
                      Preview
                    </button>

                    <button
                      disabled={busy}
                      onClick={() => deleteStep(Number(step.step))}
                      className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-sm font-medium">Step Name</div>
                    <input
                      value={step.name ?? ""}
                      onChange={(e) =>
                        updateStep(step.step, { name: e.target.value })
                      }
                      className="w-full rounded-xl border px-4 py-3"
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-sm font-medium">Due Offset (days)</div>
                    <input
                      type="number"
                      value={Number(step.due_offset_days ?? 0)}
                      onChange={(e) =>
                        updateStep(step.step, {
                          due_offset_days: Number(e.target.value || 0),
                        })
                      }
                      className="w-full rounded-xl border px-4 py-3"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-sm font-medium">Required Contact Status</div>
                    <select
                      value={step.required_contact_status ?? ""}
                      onChange={(e) =>
                        updateStep(step.step, {
                          required_contact_status: e.target.value || null,
                        })
                      }
                      className="w-full rounded-xl border px-4 py-3"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt || "blank"} value={opt}>
                          {opt || "No requirement"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(step.is_active)}
                        onChange={(e) =>
                          updateStep(step.step, { is_active: e.target.checked })
                        }
                      />
                      <span className="text-sm font-medium">Step Active</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 text-sm font-medium">Email Subject</div>
                  <input
                    value={step.subject ?? ""}
                    onChange={(e) =>
                      updateStep(step.step, { subject: e.target.value })
                    }
                    className="w-full rounded-xl border px-4 py-3"
                  />
                </div>

                <div className="mt-3">
                  <div className="mb-1 text-sm font-medium">Email Body</div>
                  <textarea
                    value={step.body ?? ""}
                    onChange={(e) =>
                      updateStep(step.step, { body: e.target.value })
                    }
                    className="min-h-[180px] w-full rounded-xl border px-4 py-3"
                  />
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Supported placeholders: {"{{coach_name}}"}, {"{{first_name}}"}, {"{{last_name}}"}, {"{{school_name}}"}, {"{{email}}"}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border p-5 h-fit sticky top-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Live Preview</div>
                <div className="text-sm text-muted-foreground">
                  Rendered using sample coach data.
                </div>
              </div>

              <select
                value={previewStep}
                onChange={(e) => setPreviewStep(Number(e.target.value || 1))}
                className="rounded-xl border px-4 py-3"
              >
                {sortedSteps.map((s) => (
                  <option key={s.step} value={s.step}>
                    Step {s.step}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 rounded-2xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Subject
              </div>
              <div className="mt-2 text-sm font-medium">
                {preview?.subject || "No subject"}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Body
              </div>
              <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                {preview?.body || "No body"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}