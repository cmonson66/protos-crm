"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SequenceDetail = {
  id: string;
  key: string;
  name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  status: "draft" | "active" | "archived";
  description: string | null;
};

type StepTemplateRow = {
  id: string;
  name: string;
  template_key: string | null;
  status: "draft" | "active" | "archived";
  channel: "email" | "linkedin" | "call_script";
  template_type: string;
  subject_template: string | null;
  body_template: string;
  call_to_action: string | null;
};

type StepRow = {
  id: string;
  sequence_id: string;
  step_number: number;
  channel: "email" | "linkedin" | "call_script";
  template_id: string | null;
  delay_days: number;
  required_contact_status: string | null;
  is_active: boolean;
  message_templates?: StepTemplateRow | null;
};

type StepDraft = {
  id?: string;
  template_id?: string | null;
  step_number: number;
  channel: "email" | "linkedin" | "call_script";
  delay_days: number;
  required_contact_status: string;
  is_active: boolean;
  template_name: string;
  subject_template: string;
  body_template: string;
  call_to_action: string;
};

const INPUT = "crm-input w-full px-3 py-2 text-sm";
const TEXTAREA = "crm-input w-full px-3 py-2 text-sm";
const BTN = "crm-button rounded-xl px-4 py-2 text-sm";
const BTN_PRIMARY = "crm-button-primary rounded-xl px-4 py-2 text-sm";
const PILL = "crm-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";

const MERGE_FIELDS = [
  { label: "First Name", token: "{{first_name}}" },
  { label: "Last Name", token: "{{last_name}}" },
  { label: "Full Name", token: "{{full_name}}" },
  { label: "Email", token: "{{primary_email}}" },
  { label: "School Name", token: "{{school_name}}" },
  { label: "Account Name", token: "{{account_name}}" },
  { label: "Sport", token: "{{sport}}" },
  { label: "Division", token: "{{division}}" },
  { label: "Conference", token: "{{conference}}" },
  { label: "Region", token: "{{region}}" },
  { label: "Rep Name", token: "{{rep_name}}" },
  { label: "Rep Email", token: "{{rep_email}}" },
] as const;

function channelTone(channel: string) {
  const v = String(channel || "").toLowerCase();
  if (v === "email") return `${PILL} border-sky-200 bg-sky-50 text-sky-700`;
  if (v === "linkedin") return `${PILL} border-violet-200 bg-violet-50 text-violet-700`;
  if (v === "call_script") return `${PILL} border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700`;
  return PILL;
}

function statusTone(status: string) {
  const v = String(status || "").toLowerCase();
  if (v === "active") return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (v === "draft") return `${PILL} border-amber-200 bg-amber-50 text-amber-700`;
  if (v === "archived") return `${PILL} border-slate-200 bg-slate-100 text-slate-700`;
  return PILL;
}

function verticalTone(vertical: string) {
  const v = String(vertical || "").toLowerCase();
  if (v === "athletics") return `${PILL} border-orange-200 bg-orange-50 text-orange-700`;
  if (v === "corporate") return `${PILL} border-indigo-200 bg-indigo-50 text-indigo-700`;
  return PILL;
}

function stageTone(stage: string) {
  const v = String(stage || "").toLowerCase();
  if (v === "new") return `${PILL} border-teal-200 bg-teal-50 text-teal-700`;
  if (v === "secured_active") return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
  return PILL;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  const tone = (() => {
    const v = String(label).toLowerCase();

    if (v.includes("total")) {
      return {
        shell: "border-slate-200 bg-white/80",
        accent: "bg-slate-700",
        value: "text-slate-900",
        label: "text-slate-600",
      };
    }

    if (v.includes("email")) {
      return {
        shell: "border-sky-200 bg-sky-50/80",
        accent: "bg-sky-500",
        value: "text-sky-900",
        label: "text-sky-700",
      };
    }

    if (v.includes("linkedin")) {
      return {
        shell: "border-violet-200 bg-violet-50/80",
        accent: "bg-violet-500",
        value: "text-violet-900",
        label: "text-violet-700",
      };
    }

    if (v.includes("call script")) {
      return {
        shell: "border-fuchsia-200 bg-fuchsia-50/80",
        accent: "bg-fuchsia-500",
        value: "text-fuchsia-900",
        label: "text-fuchsia-700",
      };
    }

    return {
      shell: "border-slate-200 bg-white/80",
      accent: "bg-slate-700",
      value: "text-slate-900",
      label: "text-slate-600",
    };
  })();

  return (
    <Card
      className={[
        "rounded-[28px] border shadow-sm transition duration-200 hover:-translate-y-[1px] hover:shadow-md",
        tone.shell,
      ].join(" ")}
    >
      <CardContent className="p-0">
        <div className="flex min-h-[136px]">
          <div className={`w-2 rounded-l-[28px] ${tone.accent}`} />
          <div className="flex flex-1 flex-col justify-between px-6 py-5">
            <div className={`text-sm font-medium tracking-wide ${tone.label}`}>
              {label}
            </div>
            <div className={`text-5xl font-semibold leading-none tracking-tight ${tone.value}`}>
              {value}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="crm-card rounded-3xl border-0 shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {right}
        </div>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function renumberSteps(steps: StepDraft[]) {
  return steps.map((step, idx) => ({
    ...step,
    step_number: idx + 1,
  }));
}

function newStep(stepNumber: number): StepDraft {
  return {
    step_number: stepNumber,
    channel: "email",
    delay_days: stepNumber === 1 ? 0 : 3,
    required_contact_status: "",
    is_active: true,
    template_name: `Step ${stepNumber}`,
    subject_template: "",
    body_template: "",
    call_to_action: "",
  };
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  value: string,
  token: string
) {
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const nextValue = value.slice(0, start) + token + value.slice(end);
  const nextCursor = start + token.length;
  return { nextValue, nextCursor };
}

export default function AdminCommunicationSequenceBuilderPage() {
  const params = useParams<{ id: string }>();
  const sequenceId = params?.id;
  const router = useRouter();

  const [sequence, setSequence] = useState<SequenceDetail | null>(null);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const bodyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const stepCount = steps.length;
  const emailCount = steps.filter((s) => s.channel === "email").length;
  const linkedInCount = steps.filter((s) => s.channel === "linkedin").length;
  const scriptCount = steps.filter((s) => s.channel === "call_script").length;

  async function load() {
    if (!sequenceId) return;
    setLoading(true);

    const [sequenceRes, stepsRes] = await Promise.all([
      fetchWithAuth(`/api/admin/communications/sequences/${sequenceId}`),
      fetchWithAuth(`/api/admin/communications/steps/list?sequence_id=${sequenceId}`),
    ]);

    const sequenceJson = await sequenceRes.json().catch(() => ({}));
    const stepsJson = await stepsRes.json().catch(() => ({}));

    if (!sequenceRes.ok) {
      alert(sequenceJson.error || "Failed to load sequence");
      setSequence(null);
      setLoading(false);
      return;
    }

    if (!stepsRes.ok) {
      alert(stepsJson.error || "Failed to load steps");
      setSteps([]);
      setLoading(false);
      return;
    }

    setSequence(sequenceJson.row || null);

    const loadedSteps = ((stepsJson.rows || []) as StepRow[])
      .slice()
      .sort((a, b) => a.step_number - b.step_number)
      .map((step) => ({
        id: step.id,
        template_id: step.template_id,
        step_number: step.step_number,
        channel: step.channel,
        delay_days: step.delay_days,
        required_contact_status: step.required_contact_status || "",
        is_active: step.is_active,
        template_name:
          step.message_templates?.name || `Step ${step.step_number}`,
        subject_template: step.message_templates?.subject_template || "",
        body_template: step.message_templates?.body_template || "",
        call_to_action: step.message_templates?.call_to_action || "",
      }));

    setSteps(loadedSteps.length ? loadedSteps : [newStep(1)]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [sequenceId]);

  function updateSequenceField<K extends keyof SequenceDetail>(key: K, value: SequenceDetail[K]) {
    setSequence((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateStep(stepNumber: number, patch: Partial<StepDraft>) {
    setSteps((prev) =>
      prev.map((step) =>
        step.step_number === stepNumber ? { ...step, ...patch } : step
      )
    );
  }

  function addStep() {
    setSteps((prev) => [...prev, newStep(prev.length + 1)]);
  }

  function removeStep(stepNumber: number) {
    setSteps((prev) => {
      const remaining = prev.filter((s) => s.step_number !== stepNumber);
      return remaining.length ? renumberSteps(remaining) : [newStep(1)];
    });
  }

  function duplicateStep(stepNumber: number) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.step_number === stepNumber);
      if (idx < 0) return prev;

      const source = prev[idx];
      const clone: StepDraft = {
        ...source,
        id: undefined,
        template_id: null,
        template_name: `${source.template_name || `Step ${source.step_number}`} Copy`,
      };

      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return renumberSteps(next);
    });
  }

  function moveStepUp(stepNumber: number) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.step_number === stepNumber);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return renumberSteps(next);
    });
  }

  function moveStepDown(stepNumber: number) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.step_number === stepNumber);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return renumberSteps(next);
    });
  }

  function insertMergeField(stepNumber: number, token: string) {
    const key = String(stepNumber);
    const el = bodyRefs.current[key];
    const step = steps.find((s) => s.step_number === stepNumber);
    if (!el || !step) return;

    const { nextValue, nextCursor } = insertAtCursor(el, step.body_template, token);

    updateStep(stepNumber, { body_template: nextValue });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const current = bodyRefs.current[key];
        if (!current) return;
        current.focus();
        current.setSelectionRange(nextCursor, nextCursor);
      });
    });
  }

  async function saveAll() {
    if (!sequenceId || !sequence) return;

    if (!sequence.key.trim() || !sequence.name.trim()) {
      alert("Sequence key and sequence name are required.");
      return;
    }

    for (const step of steps) {
      if (!step.body_template.trim()) {
        alert(`Step ${step.step_number} is missing body/script content.`);
        return;
      }

      if (step.channel === "email" && !step.subject_template.trim()) {
        alert(`Step ${step.step_number} is missing an email subject.`);
        return;
      }
    }

    setSaving(true);

    const res = await fetchWithAuth("/api/admin/communications/sequences/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sequence: {
          id: sequence.id,
          key: sequence.key,
          name: sequence.name,
          vertical: sequence.vertical,
          audience_stage: sequence.audience_stage,
          status: sequence.status,
          description: sequence.description || null,
        },
        steps: steps.map((step, idx) => ({
          id: step.id || null,
          template_id: step.template_id || null,
          step_number: idx + 1,
          channel: step.channel,
          delay_days: Number(step.delay_days || 0),
          required_contact_status: step.required_contact_status || null,
          is_active: step.is_active,
          template_name: step.template_name || `Step ${idx + 1}`,
          subject_template: step.channel === "email" ? step.subject_template : null,
          body_template: step.body_template,
          call_to_action: step.call_to_action || null,
        })),
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      alert(json.error || "Failed to save cadence");
      return;
    }

    await load();
    alert("Cadence saved.");
  }

async function deleteCadence() {
  if (!sequenceId || !sequence) return;

  const confirmed = window.confirm(
    `Delete cadence "${sequence.name}"?\n\nThis will permanently delete the cadence, all steps, and the attached step templates.`
  );

  if (!confirmed) return;

  setDeleting(true);

  const res = await fetchWithAuth("/api/admin/communications/sequences/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sequence_id: sequenceId,
    }),
  });

  const json = await res.json().catch(() => ({}));
  setDeleting(false);

  if (!res.ok) {
    alert(json.error || "Failed to delete cadence");
    return;
  }

  router.push("/admin/communications/sequences");
  router.refresh();
}

async function archiveCadence() {
  if (!sequenceId || !sequence) return;

  const confirmed = window.confirm(
    `Archive cadence "${sequence.name}"?\n\nThis will mark the cadence and its linked step templates as archived.`
  );

  if (!confirmed) return;

  setArchiving(true);

  const res = await fetchWithAuth("/api/admin/communications/sequences/archive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sequence_id: sequenceId,
    }),
  });

  const json = await res.json().catch(() => ({}));
  setArchiving(false);

  if (!res.ok) {
    alert(json.error || "Failed to archive cadence");
    return;
  }

  await load();
  alert("Cadence archived.");
}

  return (
    <div className="space-y-7">
      <PageHeader
        title="Cadence Editor"
        subtitle="Edit cadence metadata, step order, delay rules, and message content in one place."
actions={
  <div className="flex items-center gap-2">
    <Button variant="outline" className={BTN} onClick={() => void load()}>
      Refresh
    </Button>
    <Button
      variant="outline"
      className={BTN}
      onClick={archiveCadence}
      disabled={archiving || deleting || saving || !sequence}
    >
      {archiving ? "Archiving..." : "Archive Cadence"}
    </Button>
    <Button
      variant="outline"
      className={BTN}
      onClick={deleteCadence}
      disabled={deleting || archiving || saving || !sequence}
    >
      {deleting ? "Deleting..." : "Delete Cadence"}
    </Button>
    <Button
      className={BTN_PRIMARY}
      onClick={saveAll}
      disabled={saving || deleting || archiving || !sequence}
    >
      {saving ? "Saving..." : "Save Cadence"}
    </Button>
  </div>
}
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Steps" value={stepCount} />
        <MetricCard label="Email Steps" value={emailCount} />
        <MetricCard label="LinkedIn Steps" value={linkedInCount} />
        <MetricCard label="Call Script Steps" value={scriptCount} />
      </div>

      {loading || !sequence ? (
        <SectionCard title="Loading">
          <div className="text-sm text-muted-foreground">Loading cadence...</div>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Cadence Metadata"
            subtitle="This is the master cadence record admins manage."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <input
                className={INPUT}
                placeholder="Cadence key"
                value={sequence.key}
                onChange={(e) => updateSequenceField("key", e.target.value)}
              />

              <input
                className={INPUT}
                placeholder="Cadence name"
                value={sequence.name}
                onChange={(e) => updateSequenceField("name", e.target.value)}
              />

              <select
                className={INPUT}
                value={sequence.status}
                onChange={(e) =>
                  updateSequenceField(
                    "status",
                    e.target.value as "draft" | "active" | "archived"
                  )
                }
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>

              <select
                className={INPUT}
                value={sequence.vertical}
                onChange={(e) =>
                  updateSequenceField(
                    "vertical",
                    e.target.value as "athletics" | "corporate"
                  )
                }
              >
                <option value="athletics">athletics</option>
                <option value="corporate">corporate</option>
              </select>

              <select
                className={INPUT}
                value={sequence.audience_stage}
                onChange={(e) =>
                  updateSequenceField(
                    "audience_stage",
                    e.target.value as "new" | "secured_active"
                  )
                }
              >
                <option value="new">new</option>
                <option value="secured_active">secured_active</option>
              </select>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className={verticalTone(sequence.vertical)}>{sequence.vertical}</span>
                <span className={stageTone(sequence.audience_stage)}>{sequence.audience_stage}</span>
                <span className={statusTone(sequence.status)}>{sequence.status}</span>
              </div>

              <textarea
                className={`${TEXTAREA} min-h-[120px] md:col-span-2 xl:col-span-3`}
                placeholder="Description"
                value={sequence.description || ""}
                onChange={(e) => updateSequenceField("description", e.target.value)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Cadence Steps"
            subtitle="This is the real editor for ordered step content and rules."
            right={
              <Button className={BTN_PRIMARY} onClick={addStep}>
                Add Step
              </Button>
            }
          >
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <Card key={`${step.id || "new"}-${step.step_number}-${idx}`} className="crm-card-soft rounded-3xl border-0 shadow-none">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={PILL}>Step {step.step_number}</span>
                          <span className={channelTone(step.channel)}>{step.channel}</span>
                          <span
                            className={
                              step.is_active
                                ? `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`
                                : `${PILL} border-slate-200 bg-slate-100 text-slate-700`
                            }
                          >
                            {step.is_active ? "active" : "inactive"}
                          </span>
                        </div>

                        <div className="mt-2 text-sm text-muted-foreground">
                          Delay: {step.delay_days} day{step.delay_days === 1 ? "" : "s"}
                          {step.required_contact_status
                            ? ` • Requires status: ${step.required_contact_status}`
                            : ""}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className={BTN}
                          onClick={() => moveStepUp(step.step_number)}
                          disabled={idx === 0}
                        >
                          Move Up
                        </Button>
                        <Button
                          className={BTN}
                          onClick={() => moveStepDown(step.step_number)}
                          disabled={idx === steps.length - 1}
                        >
                          Move Down
                        </Button>
                        <Button className={BTN} onClick={() => duplicateStep(step.step_number)}>
                          Duplicate
                        </Button>
                        {steps.length > 1 ? (
                          <Button className={BTN} onClick={() => removeStep(step.step_number)}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <input
                        className={INPUT}
                        placeholder="Step display name"
                        value={step.template_name}
                        onChange={(e) =>
                          updateStep(step.step_number, { template_name: e.target.value })
                        }
                      />

                      <select
                        className={INPUT}
                        value={step.channel}
                        onChange={(e) =>
                          updateStep(step.step_number, {
                            channel: e.target.value as "email" | "linkedin" | "call_script",
                            subject_template:
                              e.target.value === "email" ? step.subject_template : "",
                          })
                        }
                      >
                        <option value="email">email</option>
                        <option value="linkedin">linkedin</option>
                        <option value="call_script">call_script</option>
                      </select>

                      <input
                        type="number"
                        min={0}
                        className={INPUT}
                        value={step.delay_days}
                        onChange={(e) =>
                          updateStep(step.step_number, {
                            delay_days: Number(e.target.value || 0),
                          })
                        }
                      />

                      <input
                        className={INPUT}
                        placeholder="Required status (optional)"
                        value={step.required_contact_status}
                        onChange={(e) =>
                          updateStep(step.step_number, {
                            required_contact_status: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={step.is_active}
                          onChange={(e) =>
                            updateStep(step.step_number, { is_active: e.target.checked })
                          }
                        />
                        Step active
                      </label>
                    </div>

                    {step.channel === "email" ? (
                      <Card className="crm-card mt-5 rounded-3xl border-0 shadow-none">
                        <CardContent className="p-5">
                          <div className="text-sm font-semibold">Subject</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Keep the subject clean. Merge fields insert in the body/script editor.
                          </div>
                          <input
                            className={`${INPUT} mt-3`}
                            placeholder="Email subject"
                            value={step.subject_template}
                            onChange={(e) =>
                              updateStep(step.step_number, {
                                subject_template: e.target.value,
                              })
                            }
                          />
                        </CardContent>
                      </Card>
                    ) : null}

                    <Card className="crm-card mt-5 rounded-3xl border-0 shadow-none">
                      <CardContent className="p-5">
                        <div className="text-sm font-semibold">
                          {step.channel === "call_script" ? "Call Script" : "Body"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Merge fields insert exactly at the cursor position.
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {MERGE_FIELDS.map((field) => (
                            <button
                              key={`step-${step.step_number}-${field.token}`}
                              type="button"
                              className={PILL}
                              onClick={() => insertMergeField(step.step_number, field.token)}
                            >
                              {field.label}
                            </button>
                          ))}
                        </div>

                        <textarea
                          ref={(el) => {
                            bodyRefs.current[String(step.step_number)] = el;
                          }}
                          className={`${TEXTAREA} mt-3 min-h-[240px]`}
                          placeholder={
                            step.channel === "call_script"
                              ? "Write the call script here..."
                              : "Write the step content here..."
                          }
                          value={step.body_template}
                          onChange={(e) =>
                            updateStep(step.step_number, {
                              body_template: e.target.value,
                            })
                          }
                        />
                      </CardContent>
                    </Card>

                    <Card className="crm-card mt-5 rounded-3xl border-0 shadow-none">
                      <CardContent className="p-5">
                        <div className="text-sm font-semibold">Call to Action</div>
                        <input
                          className={`${INPUT} mt-3`}
                          placeholder="Optional CTA"
                          value={step.call_to_action}
                          onChange={(e) =>
                            updateStep(step.step_number, {
                              call_to_action: e.target.value,
                            })
                          }
                        />
                      </CardContent>
                    </Card>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}