"use client";

import { useEffect, useState } from "react";

type Template = {
  id: string;
  name: string;
  cadence_key: string | null;
  cadence_step: number | null;
  subject_template: string;
  body_template: string;
  status: string;
};

export default function TemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/templates/list");
    const json = await res.json();
    setRows(json.rows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!selected) return;

    setSaving(true);

    await fetch("/api/templates/update", {
      method: "POST",
      body: JSON.stringify(selected),
    });

    setSaving(false);
    await load();
  }

  return (
    <div className="p-6 grid grid-cols-2 gap-6">
      {/* LEFT: LIST */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Templates</h2>

        {loading && <div>Loading...</div>}

        {!loading &&
          rows.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelected(t)}
              className={`p-3 mb-2 border rounded cursor-pointer ${
                selected?.id === t.id ? "bg-blue-50 border-blue-400" : ""
              }`}
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-sm text-gray-500">
                {t.cadence_key} • Step {t.cadence_step}
              </div>
            </div>
          ))}
      </div>

      {/* RIGHT: EDIT */}
      <div>
        {!selected && <div>Select a template</div>}

        {selected && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              {selected.name}
            </h2>

            <input
              value={selected.subject_template}
              onChange={(e) =>
                setSelected({ ...selected, subject_template: e.target.value })
              }
              className="w-full border p-2 rounded"
              placeholder="Subject"
            />

            <textarea
              value={selected.body_template}
              onChange={(e) =>
                setSelected({ ...selected, body_template: e.target.value })
              }
              className="w-full border p-2 rounded h-64"
            />

            <select
              value={selected.status}
              onChange={(e) =>
                setSelected({ ...selected, status: e.target.value })
              }
              className="border p-2 rounded"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>

            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-black text-white rounded"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}