"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Task = {
  id: string;
  title: string | null;
  task_type: string;
  due_at: string;
  status: string | null;
  notes: string | null;
};

export default function TasksPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth("/api/tasks/list?status=open&limit=300");
    const json = await res.json();

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load tasks");
      setRows([]);
    } else {
      setRows(json.data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-semibold">Tasks</h1>
          <div className="mt-2 text-muted-foreground">
            {loading ? "Loading..." : err ? err : `Loaded ${rows.length} tasks.`}
          </div>
        </div>

        <button onClick={load} className="rounded-xl border px-5 py-3">
          Refresh
        </button>
      </div>

      <div className="mt-6 overflow-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="p-3 text-left">Due</th>
              <th className="p-3 text-left">Title</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="p-3">{new Date(t.due_at).toLocaleString()}</td>
                <td className="p-3">{t.title ?? "(no title)"}</td>
                <td className="p-3">{t.task_type}</td>
                <td className="p-3">{t.status ?? ""}</td>
              </tr>
            ))}

            {!loading && !err && rows.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No tasks found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}