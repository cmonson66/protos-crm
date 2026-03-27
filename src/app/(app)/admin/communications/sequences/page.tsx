"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SequenceRow = {
  id: string;
  key: string;
  name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  status: "draft" | "active" | "archived";
  description: string | null;
};

const INPUT = "crm-input w-full px-3 py-2 text-sm";
const BTN = "crm-button rounded-xl px-4 py-2 text-sm";
const BTN_PRIMARY = "crm-button-primary rounded-xl px-4 py-2 text-sm";
const PILL = "crm-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-medium";

function pillTone(
  type: "status" | "vertical" | "stage",
  value: string | null | undefined
) {
  const v = String(value || "").toLowerCase();

  if (type === "status") {
    if (v === "active") return `${PILL} border-emerald-200 bg-emerald-50 text-emerald-700`;
    if (v === "draft") return `${PILL} border-amber-200 bg-amber-50 text-amber-700`;
    if (v === "archived") return `${PILL} border-slate-200 bg-slate-100 text-slate-700`;
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

export default function AdminCommunicationSequencesPage() {
  const [rows, setRows] = useState<SequenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [keyValue, setKeyValue] = useState("");
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState<"athletics" | "corporate">("athletics");
  const [audienceStage, setAudienceStage] = useState<"new" | "secured_active">("new");
  const [status, setStatus] = useState<"draft" | "active" | "archived">("draft");
  const [description, setDescription] = useState("");

  async function load() {
    setLoading(true);

    const res = await fetchWithAuth("/api/admin/communications/sequences/list");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json.error || "Failed to load sequences");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(json.rows || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createSequence() {
    setSaving(true);

    const res = await fetchWithAuth("/api/admin/communications/sequences/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: keyValue,
        name,
        vertical,
        audience_stage: audienceStage,
        status,
        description,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      alert(json.error || "Failed to create sequence");
      return;
    }

    setKeyValue("");
    setName("");
    setVertical("athletics");
    setAudienceStage("new");
    setStatus("draft");
    setDescription("");
    await load();
  }

  const stats = useMemo(
    () => ({
      total: rows.length,
      drafts: rows.filter((r) => r.status === "draft").length,
      active: rows.filter((r) => r.status === "active").length,
      athletics: rows.filter((r) => r.vertical === "athletics").length,
      corporate: rows.filter((r) => r.vertical === "corporate").length,
    }),
    [rows]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication Sequences"
        subtitle="Manage the master sequence library for athletics and corporate outreach."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className={BTN} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Drafts" value={stats.drafts} />
        <MetricCard label="Active" value={stats.active} />
        <MetricCard label="Athletics" value={stats.athletics} />
        <MetricCard label="Corporate" value={stats.corporate} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <SectionCard
          title="Create Sequence"
          subtitle="Define the sequence identity before adding steps in the builder."
        >
          <div className="grid gap-4">
            <input
              className={INPUT}
              placeholder="Key (example: athletics_prospecting_v1)"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
            />

            <input
              className={INPUT}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <select
                className={INPUT}
                value={vertical}
                onChange={(e) => setVertical(e.target.value as "athletics" | "corporate")}
              >
                <option value="athletics">athletics</option>
                <option value="corporate">corporate</option>
              </select>

              <select
                className={INPUT}
                value={audienceStage}
                onChange={(e) => setAudienceStage(e.target.value as "new" | "secured_active")}
              >
                <option value="new">new</option>
                <option value="secured_active">secured_active</option>
              </select>
            </div>

            <select
              className={INPUT}
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "active" | "archived")}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>

            <textarea
              className={`${INPUT} min-h-[120px]`}
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Button className={BTN_PRIMARY} onClick={createSequence} disabled={saving}>
              {saving ? "Creating..." : "Create Sequence"}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Existing Sequences"
          subtitle="Open a sequence to manage ordered steps and execution rules."
        >
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sequences yet.</div>
          ) : (
            <div className="crm-table overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3">Key</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Vertical</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium">{row.key}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.name}</div>
                        {row.description ? (
                          <div className="mt-1 text-xs text-muted-foreground">{row.description}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={pillTone("vertical", row.vertical)}>{row.vertical}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={pillTone("stage", row.audience_stage)}>{row.audience_stage}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={pillTone("status", row.status)}>{row.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          className={`${BTN_PRIMARY} inline-block`}
                          href={`/admin/communications/sequences/${row.id}`}
                        >
                          Open Builder
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}