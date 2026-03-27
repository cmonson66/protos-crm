"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TemplateRow = {
  id: string;
  name: string;
  template_key: string | null;
  status: "draft" | "active" | "archived";
  channel: "email" | "linkedin" | "call_script";
  template_type: "product_followup" | "linkedin_outreach" | "call_script" | "cadence";
  template_scope: string | null;
  audience_stage: "new" | "secured_active";
  vertical: "athletics" | "corporate";
  product_tree_family: string | null;
  product_tree_category: string | null;
  product_tree_subcategory: string | null;
  product_tree_item: string | null;
  subject_template: string | null;
  body_template: string;
  call_to_action: string | null;
  updated_at: string;
};

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

const DEFAULT_FORM = {
  id: "",
  name: "",
  template_key: "",
  status: "draft" as "draft" | "active" | "archived",
  channel: "email" as "email" | "linkedin" | "call_script",
  template_type: "product_followup" as
    | "product_followup"
    | "linkedin_outreach"
    | "call_script",
  template_scope: "manual",
  audience_stage: "new" as "new" | "secured_active",
  vertical: "corporate" as "athletics" | "corporate",
  product_tree_family: "",
  product_tree_category: "",
  product_tree_subcategory: "",
  product_tree_item: "",
  subject_template: "",
  body_template: "",
  call_to_action: "",
};

const INPUT = "crm-input w-full px-3 py-2 text-sm";
const TEXTAREA = "crm-input w-full px-3 py-2 text-sm";
const BTN = "crm-button rounded-xl px-4 py-2 text-sm";
const BTN_PRIMARY = "crm-button-primary rounded-xl px-4 py-2 text-sm";
const PILL = "crm-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";

function prettyDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function pillTone(
  type: "status" | "channel" | "vertical" | "stage",
  value: string | null | undefined
) {
  const v = String(value || "").toLowerCase();

  if (type === "status") {
    if (v === "active") return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
    if (v === "draft") return `${PILL} border-amber-200 bg-amber-50 text-amber-700`;
    if (v === "archived") return `${PILL} border-slate-200 bg-slate-100 text-slate-700`;
  }

  if (type === "channel") {
    if (v === "email") return `${PILL} border-sky-200 bg-sky-50 text-sky-700`;
    if (v === "linkedin") return `${PILL} border-violet-200 bg-violet-50 text-violet-700`;
    if (v === "call_script") return `${PILL} border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700`;
  }

  if (type === "vertical") {
    if (v === "athletics") return `${PILL} border-orange-200 bg-orange-50 text-orange-700`;
    if (v === "corporate") return `${PILL} border-indigo-200 bg-indigo-50 text-indigo-700`;
  }

  if (type === "stage") {
    if (v === "new") return `${PILL} border-teal-200 bg-teal-50 text-teal-700`;
    if (v === "secured_active") return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
  }

  return PILL;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card className="crm-card rounded-3xl border-0 shadow-none">
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
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

export default function AdminCommunicationTemplatesPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState(DEFAULT_FORM);

  const [filterVertical, setFilterVertical] = useState<"" | "athletics" | "corporate">("");
  const [filterChannel, setFilterChannel] = useState<"" | "email" | "linkedin" | "call_script">("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "active" | "archived">("");
  const [filterType, setFilterType] = useState<
    "" | "product_followup" | "linkedin_outreach" | "call_script"
  >("");

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  async function load() {
    setLoading(true);

    const params = new URLSearchParams();
    if (filterVertical) params.set("vertical", filterVertical);
    if (filterChannel) params.set("channel", filterChannel);
    if (filterStatus) params.set("status", filterStatus);
    if (filterType) params.set("template_type", filterType);

    const qs = params.toString();

    try {
      const res = await fetchWithAuth(`/api/admin/templates/list${qs ? `?${qs}` : ""}`);

      let json: any = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok) {
        alert(json?.error || "Failed to load templates");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(Array.isArray(json?.rows) ? json.rows : []);
      setLoading(false);
    } catch (e: any) {
      alert(e?.message || "Failed to load templates");
      setRows([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filterVertical, filterChannel, filterStatus, filterType]);

  const visibleRows = useMemo(
    () => rows.filter((r) => r.template_type !== "cadence"),
    [rows]
  );

  const selected = useMemo(
    () => visibleRows.find((r) => r.id === selectedId) || null,
    [visibleRows, selectedId]
  );

  useEffect(() => {
    if (!selected) return;

    setForm({
      id: selected.id,
      name: selected.name || "",
      template_key: selected.template_key || "",
      status: selected.status,
      channel: selected.channel,
      template_type:
        selected.template_type === "cadence"
          ? "product_followup"
          : selected.template_type,
      template_scope: selected.template_scope || "manual",
      audience_stage: selected.audience_stage,
      vertical: selected.vertical,
      product_tree_family: selected.product_tree_family || "",
      product_tree_category: selected.product_tree_category || "",
      product_tree_subcategory: selected.product_tree_subcategory || "",
      product_tree_item: selected.product_tree_item || "",
      subject_template: selected.subject_template || "",
      body_template: selected.body_template || "",
      call_to_action: selected.call_to_action || "",
    });
  }, [selected]);

  function resetForm() {
    setSelectedId("");
    setForm(DEFAULT_FORM);
  }

  function insertMergeField(token: string) {
    const el = bodyRef.current;
    if (!el) return;

    const { nextValue, nextCursor } = insertAtCursor(el, form.body_template, token);

    setForm((f) => ({
      ...f,
      body_template: nextValue,
    }));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!bodyRef.current) return;
        bodyRef.current.focus();
        bodyRef.current.setSelectionRange(nextCursor, nextCursor);
      });
    });
  }

  async function createTemplate() {
    if (!form.name.trim() || !form.body_template.trim()) {
      alert("Name and body are required.");
      return;
    }

    setSaving(true);

    const res = await fetchWithAuth("/api/admin/templates/create", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        template_key: form.template_key || null,
        status: form.status,
        channel: form.channel,
        template_type: form.template_type,
        template_scope: form.template_scope || null,
        audience_stage: form.audience_stage,
        vertical: form.vertical,
        product_tree_family: form.product_tree_family || null,
        product_tree_category: form.product_tree_category || null,
        product_tree_subcategory: form.product_tree_subcategory || null,
        product_tree_item: form.product_tree_item || null,
        subject_template: form.channel === "email" ? form.subject_template || null : null,
        body_template: form.body_template,
        call_to_action: form.call_to_action || null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      alert(json.error || "Failed to create template");
      return;
    }

    await load();
    resetForm();
  }

  async function saveTemplate() {
    if (!form.id) {
      alert("Select a template first.");
      return;
    }

    if (!form.name.trim() || !form.body_template.trim()) {
      alert("Name and body are required.");
      return;
    }

    setSaving(true);

    const res = await fetchWithAuth("/api/admin/templates/update", {
      method: "POST",
      body: JSON.stringify({
        id: form.id,
        name: form.name,
        template_key: form.template_key || null,
        status: form.status,
        channel: form.channel,
        template_type: form.template_type,
        template_scope: form.template_scope || null,
        audience_stage: form.audience_stage,
        vertical: form.vertical,
        product_tree_family: form.product_tree_family || null,
        product_tree_category: form.product_tree_category || null,
        product_tree_subcategory: form.product_tree_subcategory || null,
        product_tree_item: form.product_tree_item || null,
        subject_template: form.channel === "email" ? form.subject_template || null : null,
        body_template: form.body_template,
        call_to_action: form.call_to_action || null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      alert(json.error || "Failed to update template");
      return;
    }

    await load();
  }

  const drafts = visibleRows.filter((r) => r.status === "draft").length;
  const active = visibleRows.filter((r) => r.status === "active").length;
  const athletics = visibleRows.filter((r) => r.vertical === "athletics").length;
  const corporate = visibleRows.filter((r) => r.vertical === "corporate").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Templates"
        subtitle="Manage centrally owned follow-up, LinkedIn, and call script templates. Cadence authoring lives in Sequences."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className={BTN} onClick={resetForm}>
              Reset Composer
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Drafts" value={drafts} />
        <MetricCard label="Active" value={active} />
        <MetricCard label="Athletics" value={athletics} />
        <MetricCard label="Corporate" value={corporate} />
      </div>

      <SectionCard
        title="Filters"
        subtitle="Narrow the library by vertical, channel, status, and template type."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <select
            className={INPUT}
            value={filterVertical}
            onChange={(e) =>
              setFilterVertical(e.target.value as "" | "athletics" | "corporate")
            }
          >
            <option value="">All verticals</option>
            <option value="athletics">athletics</option>
            <option value="corporate">corporate</option>
          </select>

          <select
            className={INPUT}
            value={filterChannel}
            onChange={(e) =>
              setFilterChannel(e.target.value as "" | "email" | "linkedin" | "call_script")
            }
          >
            <option value="">All channels</option>
            <option value="email">email</option>
            <option value="linkedin">linkedin</option>
            <option value="call_script">call_script</option>
          </select>

          <select
            className={INPUT}
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as "" | "draft" | "active" | "archived")
            }
          >
            <option value="">All statuses</option>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>

          <select
            className={INPUT}
            value={filterType}
            onChange={(e) =>
              setFilterType(
                e.target.value as "" | "product_followup" | "linkedin_outreach" | "call_script"
              )
            }
          >
            <option value="">All types</option>
            <option value="product_followup">product_followup</option>
            <option value="linkedin_outreach">linkedin_outreach</option>
            <option value="call_script">call_script</option>
          </select>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <SectionCard
          title="Template Library"
          subtitle="Flat reusable templates only. Cadence step content is managed in Sequences."
          right={
            <Button variant="outline" className={BTN} onClick={resetForm}>
              New
            </Button>
          }
        >
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : visibleRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No templates found.</div>
          ) : (
            <div className="space-y-3">
              {visibleRows.map((row) => {
                const isSelected = selectedId === row.id;

                return (
                  <button
                    key={row.id}
                    className={[
                      "crm-card-soft block w-full rounded-2xl border-0 p-4 text-left transition hover:-translate-y-[1px] hover:bg-white",
                      isSelected ? "ring-2 ring-orange-300" : "",
                    ].join(" ")}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{row.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={pillTone("channel", row.channel)}>{row.channel}</span>
                          <span className={PILL}>{row.template_type}</span>
                          <span className={pillTone("vertical", row.vertical)}>{row.vertical}</span>
                          <span className={pillTone("stage", row.audience_stage)}>
                            {row.audience_stage}
                          </span>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          Updated {prettyDate(row.updated_at)}
                        </div>
                      </div>
                      <span className={pillTone("status", row.status)}>{row.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={form.id ? "Edit Template" : "Create Template"}
          subtitle="Admins and managers author the reusable messaging library here."
          right={
            !form.id ? (
              <Button className={BTN_PRIMARY} onClick={createTemplate} disabled={saving}>
                {saving ? "Creating..." : "Create"}
              </Button>
            ) : (
              <Button className={BTN_PRIMARY} onClick={saveTemplate} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input
              className={INPUT}
              placeholder="Template name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />

            <input
              className={INPUT}
              placeholder="Template key (optional)"
              value={form.template_key}
              onChange={(e) => setForm((f) => ({ ...f, template_key: e.target.value }))}
            />

            <select
              className={INPUT}
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as "draft" | "active" | "archived",
                }))
              }
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>

            <select
              className={INPUT}
              value={form.channel}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  channel: e.target.value as "email" | "linkedin" | "call_script",
                  template_type:
                    e.target.value === "linkedin"
                      ? "linkedin_outreach"
                      : e.target.value === "call_script"
                        ? "call_script"
                        : "product_followup",
                  subject_template:
                    e.target.value === "email" ? f.subject_template : "",
                }))
              }
            >
              <option value="email">email</option>
              <option value="linkedin">linkedin</option>
              <option value="call_script">call_script</option>
            </select>

            <select
              className={INPUT}
              value={form.template_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  template_type: e.target.value as
                    | "product_followup"
                    | "linkedin_outreach"
                    | "call_script",
                }))
              }
            >
              <option value="product_followup">product_followup</option>
              <option value="linkedin_outreach">linkedin_outreach</option>
              <option value="call_script">call_script</option>
            </select>

            <input
              className={INPUT}
              placeholder="Template scope"
              value={form.template_scope}
              onChange={(e) => setForm((f) => ({ ...f, template_scope: e.target.value }))}
            />

            <select
              className={INPUT}
              value={form.audience_stage}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  audience_stage: e.target.value as "new" | "secured_active",
                }))
              }
            >
              <option value="new">new</option>
              <option value="secured_active">secured_active</option>
            </select>

            <select
              className={INPUT}
              value={form.vertical}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vertical: e.target.value as "athletics" | "corporate",
                }))
              }
            >
              <option value="athletics">athletics</option>
              <option value="corporate">corporate</option>
            </select>

            <input
              className={INPUT}
              placeholder="Product family"
              value={form.product_tree_family}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_tree_family: e.target.value }))
              }
            />

            <input
              className={INPUT}
              placeholder="Product category"
              value={form.product_tree_category}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_tree_category: e.target.value }))
              }
            />

            <input
              className={INPUT}
              placeholder="Product subcategory"
              value={form.product_tree_subcategory}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_tree_subcategory: e.target.value }))
              }
            />

            <input
              className={`${INPUT} md:col-span-2 xl:col-span-3`}
              placeholder="Product item"
              value={form.product_tree_item}
              onChange={(e) =>
                setForm((f) => ({ ...f, product_tree_item: e.target.value }))
              }
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
            <div className="space-y-6">
              {form.channel === "email" ? (
                <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                  <CardContent className="p-5">
                    <div className="text-sm font-semibold">Subject</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Keep the subject clean. Merge fields insert in the main body editor only.
                    </div>
                    <input
                      className={`${INPUT} mt-3`}
                      placeholder="Subject template"
                      value={form.subject_template}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, subject_template: e.target.value }))
                      }
                    />
                  </CardContent>
                </Card>
              ) : null}

              <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">
                    {form.channel === "call_script" ? "Call Script" : "Body"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Merge fields insert at the actual cursor location.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {MERGE_FIELDS.map((field) => (
                      <button
                        key={`single-body-${field.token}`}
                        type="button"
                        className={PILL}
                        onClick={() => insertMergeField(field.token)}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={bodyRef}
                    className={`${TEXTAREA} mt-3 min-h-[320px]`}
                    placeholder={
                      form.channel === "call_script"
                        ? "Write the call script here..."
                        : "Write the template body here..."
                    }
                    value={form.body_template}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, body_template: e.target.value }))
                    }
                  />
                </CardContent>
              </Card>

              <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Call to Action</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Optional CTA or reply prompt for the recipient.
                  </div>
                  <input
                    className={`${INPUT} mt-3`}
                    placeholder="Optional CTA"
                    value={form.call_to_action}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, call_to_action: e.target.value }))
                    }
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Template Summary</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={pillTone("channel", form.channel)}>{form.channel}</span>
                    <span className={pillTone("vertical", form.vertical)}>{form.vertical}</span>
                    <span className={pillTone("stage", form.audience_stage)}>{form.audience_stage}</span>
                    <span className={pillTone("status", form.status)}>{form.status}</span>
                  </div>

                  <div className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
                    Scope
                  </div>
                  <div className="mt-1 text-sm">{form.template_scope || "—"}</div>

                  <div className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
                    Product Path
                  </div>
                  <div className="mt-1 text-sm">
                    {[
                      form.product_tree_family,
                      form.product_tree_category,
                      form.product_tree_subcategory,
                      form.product_tree_item,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </div>
                </CardContent>
              </Card>

              <Card className="crm-card-soft rounded-3xl border-0 shadow-none">
                <CardContent className="p-5">
                  <div className="text-sm font-semibold">Preview</div>

                  {form.channel === "email" ? (
                    <div className="crm-card-soft mt-4 rounded-2xl border-0 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Subject
                      </div>
                      <div className="mt-2 text-sm font-semibold">
                        {form.subject_template || "—"}
                      </div>
                    </div>
                  ) : null}

                  <div className="crm-card-soft mt-4 rounded-2xl border-0 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {form.channel === "call_script" ? "Call Script" : "Body"}
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-sm">
                      {form.body_template || "—"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}