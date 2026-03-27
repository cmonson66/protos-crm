// src/app/(app)/tasks/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Task = {
  id: string;
  title: string | null;
  task_type: string;
  due_at: string;
  status: string | null;
  notes: string | null;
};

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function toLocalDateTimeInputValue(ts: string | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function taskTypeLabel(taskType: string) {
  return String(taskType || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function statusTone(status: string | null) {
  if (status === "open") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "canceled") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "in_progress") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function dueTone(ts: string | null | undefined) {
  if (!ts) return "text-slate-700";
  const due = new Date(ts).getTime();
  const now = Date.now();

  if (Number.isNaN(due)) return "text-slate-700";
  if (due < now) return "text-red-700";
  if (due - now <= 24 * 60 * 60 * 1000) return "text-amber-700";
  return "text-slate-700";
}

export default function TasksPage() {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editNotes, setEditNotes] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);

    const res = await fetchWithAuth("/api/tasks/list?status=open&limit=300");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load tasks");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as Task[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const summary = useMemo(() => {
    const now = Date.now();

    let overdue = 0;
    let dueToday = 0;

    for (const row of rows) {
      const due = new Date(row.due_at).getTime();
      if (Number.isNaN(due)) continue;

      if (due < now) {
        overdue += 1;
        continue;
      }

      if (due - now <= 24 * 60 * 60 * 1000) {
        dueToday += 1;
      }
    }

    return {
      total: rows.length,
      overdue,
      dueToday,
    };
  }, [rows]);

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title ?? "");
    setEditDueAt(toLocalDateTimeInputValue(task.due_at));
    setEditNotes(task.notes ?? "");
    setErr(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDueAt("");
    setEditNotes("");
  }

  async function saveEdit(taskId: string) {
    setBusyId(taskId);
    setErr(null);

    const dueIso = editDueAt ? new Date(editDueAt).toISOString() : null;

    const res = await fetchWithAuth("/api/tasks/by-id", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        title: editTitle,
        due_at: dueIso,
        notes: editNotes,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to save task");
      setBusyId(null);
      return;
    }

    setToast("Task updated");
    setBusyId(null);
    cancelEdit();
    await load();
  }

  async function completeTask(taskId: string) {
    const ok = window.confirm("Mark this task complete?");
    if (!ok) return;

    setBusyId(taskId);
    setErr(null);

    const res = await fetchWithAuth("/api/tasks/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: taskId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to complete task");
      setBusyId(null);
      return;
    }

    setToast("Task completed");
    setBusyId(null);

    if (editingId === taskId) {
      cancelEdit();
    }

    await load();
  }

  return (
    <div className="space-y-8 p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-4xl font-semibold tracking-tight text-slate-900">
                Tasks
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                  {summary.total} Open Tasks
                </span>

                <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                  {summary.overdue} Overdue
                </span>

                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  {summary.dueToday} Due in 24h
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                {loading
                  ? "Loading tasks..."
                  : err
                  ? err
                  : `Loaded ${rows.length} open tasks.`}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={load} className="crm-button px-5 py-3">
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-3">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total Open
            </div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {summary.total}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Overdue
            </div>
            <div className="mt-2 text-3xl font-semibold text-red-700">
              {summary.overdue}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Due in 24 Hours
            </div>
            <div className="mt-2 text-3xl font-semibold text-amber-700">
              {summary.dueToday}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="crm-card p-0 overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="text-lg font-semibold text-slate-900">Open Task List</div>
          <div className="mt-1 text-sm text-slate-600">
            Current task inventory across the CRM.
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="p-3 text-left text-slate-500">Due</th>
                <th className="p-3 text-left text-slate-500">Title</th>
                <th className="p-3 text-left text-slate-500">Type</th>
                <th className="p-3 text-left text-slate-500">Status</th>
                <th className="p-3 text-left text-slate-500">Notes</th>
                <th className="p-3 text-left text-slate-500">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((t) => {
                const isEditing = editingId === t.id;
                const isBusy = busyId === t.id;

                return (
                  <React.Fragment key={t.id}>
                    <tr className="border-b border-slate-200">
                      <td className={`p-3 font-medium ${dueTone(t.due_at)}`}>
                        {formatDateTime(t.due_at)}
                      </td>

                      <td className="p-3 text-slate-900">
                        {t.title ?? "(no title)"}
                      </td>

                      <td className="p-3 text-slate-700">
                        {taskTypeLabel(t.task_type)}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(
                            t.status
                          )}`}
                        >
                          {t.status ?? "—"}
                        </span>
                      </td>

                      <td className="p-3 text-slate-600">
                        {t.notes?.trim() || "—"}
                      </td>

                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            disabled={isBusy}
                            className="crm-button px-3 py-2 text-xs disabled:opacity-50"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => void completeTask(t.id)}
                            disabled={isBusy}
                            className="crm-button-primary px-3 py-2 text-xs disabled:opacity-50"
                          >
                            {isBusy ? "Working..." : "Mark Complete"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isEditing ? (
                      <tr className="border-b border-slate-200 bg-slate-50/70">
                        <td colSpan={6} className="p-4">
                          <div className="grid gap-3 md:grid-cols-3">
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="crm-input px-4 py-3"
                              placeholder="Task title"
                            />

                            <input
                              type="datetime-local"
                              value={editDueAt}
                              onChange={(e) => setEditDueAt(e.target.value)}
                              className="crm-input px-4 py-3"
                            />

                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="crm-input min-h-[96px] px-4 py-3 md:col-span-3"
                              placeholder="Notes"
                            />
                          </div>

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveEdit(t.id)}
                              disabled={isBusy}
                              className="crm-button-primary px-4 py-2 disabled:opacity-50"
                            >
                              {isBusy ? "Saving..." : "Save"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isBusy}
                              className="crm-button px-4 py-2 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  );
              })}

              {!loading && !err && rows.length === 0 && (
                <tr>
                  <td className="p-6 text-slate-500" colSpan={6}>
                    No tasks found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}