"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Status =
  | "inactive"
  | "scheduled"
  | "due"
  | "overdue"
  | "broken";

type StatusResponse = {
  state?: Status;
  message?: string;
  due_at?: string;
  minutes_overdue?: number;
  error?: string;
};

export default function CadenceStatusBanner({
  contactId,
  onExecute,
  onRepair,
}: {
  contactId: string;
  onExecute: () => void;
  onRepair: () => void;
}) {
  const [status, setStatus] = useState<Status>("inactive");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    try {
      const res = await fetchWithAuth(`/api/cadence/status?contact_id=${contactId}`);
      const json = (await res.json().catch(() => ({}))) as StatusResponse;

      if (!res.ok) {
        setStatus("broken");
        setMessage(json.error || "Unable to load cadence status");
        setLoading(false);
        return;
      }

      setStatus(json.state || "inactive");
      setMessage(json.message || "");
      setLoading(false);
    } catch (e: any) {
      setStatus("broken");
      setMessage(e?.message || "Unable to load cadence status");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [contactId]);

  const colors: Record<Status, string> = {
    inactive: "bg-slate-100 border-slate-200",
    scheduled: "bg-blue-50 border-blue-200",
    due: "bg-green-50 border-green-200",
    overdue: "bg-amber-50 border-amber-200",
    broken: "bg-red-50 border-red-200",
  };

  const titleByStatus: Record<Status, string> = {
    inactive: "Cadence Inactive",
    scheduled: "Cadence Active",
    due: "Cadence Active",
    overdue: "Cadence Active",
    broken: "Cadence Needs Repair",
  };

  return (
    <div className={`rounded-2xl border p-4 ${colors[status]}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">
            {loading ? "Cadence Status" : titleByStatus[status]}
          </div>

          <div className="mt-1 text-sm text-muted-foreground">
            {loading ? "Checking cadence..." : message}
          </div>
        </div>

        <div className="flex gap-2">
          {(status === "due" || status === "overdue") && (
            <button
              onClick={onExecute}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
            >
              Execute Step
            </button>
          )}

          {status === "broken" && (
            <button
              onClick={onRepair}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
            >
              Repair Cadence
            </button>
          )}
        </div>
      </div>
    </div>
  );
}