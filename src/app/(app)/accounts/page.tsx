"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type AccountRadarRow = {
  account_id: string;
  name: string;
  industry: string | null;
  company_size: string | null;
  hq_location: string | null;
  website: string | null;
  total_contacts: number;
  active_cadences: number;
  stale_contacts: number;
  touched_last_7_days: number;
  secured_active_contacts: number;
  highest_priority_contact_id: string | null;
  highest_priority_contact_name: string | null;
  highest_priority_score: number;
  most_recent_activity_at: string | null;
  buying_committee: {
    roles: {
      economic_buyer: number;
      technical_buyer: number;
      champion: number;
      operator: number;
      unknown: number;
    };
    coverage: {
      has_economic_buyer: boolean;
      has_technical_buyer: boolean;
      has_champion: boolean;
      has_operator: boolean;
    };
  };
  heat: {
    account_heat_score: number;
    account_heat_label: "Hot" | "Warm" | "Cooling" | "Cold";
    account_heat_reason: string;
    breakdown: { label: string; points: number }[];
  };
};

type AccountsRadarResponse = {
  data: AccountRadarRow[];
  count: number;
};

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function heatTone(label: "Hot" | "Warm" | "Cooling" | "Cold") {
  switch (label) {
    case "Hot":
      return "border-red-200 bg-red-50 text-red-700";
    case "Warm":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Cooling":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Cold":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function coverageTone(covered: boolean) {
  return covered
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
}

export default function AccountsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<AccountRadarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  async function load(nextLimit?: number) {
    setLoading(true);
    setErr(null);

    const useLimit = nextLimit ?? limit;
    const res = await fetchWithAuth(`/api/accounts/radar?limit=${useLimit}`);
    const json = (await res.json().catch(() => ({}))) as Partial<AccountsRadarResponse> & {
      error?: string;
    };

    if (!res.ok) {
      setErr(json.error ?? "Failed to load account radar");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as AccountRadarRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAccountAction(
    accountId: string,
    action: "work_hottest_contact" | "create_account_task" | "find_missing_buyer"
  ) {
    setBusyAccountId(accountId);
    setErr(null);

    const body: Record<string, unknown> = {
      account_id: accountId,
      action,
    };

    if (action === "create_account_task") {
      body.due_days = 2;
    }

    if (action === "find_missing_buyer") {
      body.due_days = 1;
    }

    try {
      const res = await fetchWithAuth("/api/accounts/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      let json: any = {};

      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { raw };
      }

      if (!res.ok) {
        const message =
          json?.error ||
          json?.message ||
          json?.details ||
          json?.raw ||
          `Account action failed (${res.status})`;

        setErr(message);
        setBusyAccountId(null);
        return;
      }

      const taskId = json?.task_id ? String(json.task_id) : "";

      if (action === "work_hottest_contact") {
        setToast("Hottest contact promoted to Work Queue");
        setBusyAccountId(null);
        router.push(taskId ? `/work?task_id=${encodeURIComponent(taskId)}` : "/work");
        return;
      }

      if (action === "create_account_task") {
        setToast("Account task created");
        setBusyAccountId(null);
        router.push(taskId ? `/work?task_id=${encodeURIComponent(taskId)}` : "/work");
        return;
      }

      setToast("Missing buyer task created");
      setBusyAccountId(null);
      router.push(taskId ? `/work?task_id=${encodeURIComponent(taskId)}` : "/work");
      return;
    } catch (e: any) {
      setErr(e?.message || "Account action failed");
      setBusyAccountId(null);
    }
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        String(row.industry || "").toLowerCase().includes(query) ||
        String(row.company_size || "").toLowerCase().includes(query) ||
        String(row.hq_location || "").toLowerCase().includes(query) ||
        String(row.highest_priority_contact_name || "").toLowerCase().includes(query)
      );
    });
  }, [rows, q]);

  return (
    <div className="space-y-8 p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{toast}</div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-rose-50/80 px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                Accounts Radar
              </h1>
              <div className="mt-2 text-sm text-slate-600">
                Ranked account heat, buying-committee coverage, and coordinated pursuit
                signals.
              </div>
            </div>

            <div className="flex gap-2">
              <Link href="/contacts" className="crm-button px-5 py-3">
                Contacts
              </Link>
              <Link href="/work" className="crm-button px-5 py-3">
                Work Queue
              </Link>
              <button onClick={() => void load()} className="crm-button px-5 py-3">
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="crm-card p-6">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_160px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search account, industry, top contact..."
            className="crm-input px-4 py-3"
          />

          <select
            value={limit}
            onChange={(e) => {
              const next = Number(e.target.value || 24);
              setLimit(next);
              void load(next);
            }}
            className="crm-input px-4 py-3"
          >
            <option value={12}>Top 12</option>
            <option value={24}>Top 24</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>

          <div className="crm-card-soft flex items-center px-4 py-3 text-sm text-slate-500">
            {loading ? "Loading..." : `${filtered.length} accounts`}
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="crm-card p-6 text-sm text-slate-500">Loading account radar…</div>
      ) : filtered.length === 0 ? (
        <div className="crm-card p-8 text-center text-slate-500">
          No accounts found.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((row, idx) => {
            const isBusy = busyAccountId === row.account_id;

            return (
              <div key={row.account_id} className="crm-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        #{idx + 1}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${heatTone(
                          row.heat.account_heat_label
                        )}`}
                      >
                        {row.heat.account_heat_label}
                      </span>
                    </div>

                    <div className="mt-2 text-xl font-semibold text-slate-900">
                      {row.name}
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {row.industry || "No industry"}
                      {row.company_size ? ` • ${row.company_size}` : ""}
                      {row.hq_location ? ` • ${row.hq_location}` : ""}
                    </div>

                    <div className="mt-2 text-sm text-slate-700">
                      {row.heat.account_heat_reason}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="crm-card-soft px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        Heat Score
                      </div>
                      <div className="mt-1 text-3xl font-semibold text-slate-900">
                        {row.heat.account_heat_score}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-5">
                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">Contacts</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {row.total_contacts}
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">Active Cadences</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {row.active_cadences}
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">Touched 7d</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {row.touched_last_7_days}
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">Stale</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {row.stale_contacts}
                    </div>
                  </div>

                  <div className="crm-card-soft p-3">
                    <div className="text-xs text-slate-500">Secured</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {row.secured_active_contacts}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-slate-900">
                    Buying Committee Coverage
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <div
                      className={`rounded-xl border px-3 py-2 text-sm ${coverageTone(
                        row.buying_committee.coverage.has_economic_buyer
                      )}`}
                    >
                      Economic Buyer: {row.buying_committee.roles.economic_buyer}
                    </div>

                    <div
                      className={`rounded-xl border px-3 py-2 text-sm ${coverageTone(
                        row.buying_committee.coverage.has_technical_buyer
                      )}`}
                    >
                      Technical Buyer: {row.buying_committee.roles.technical_buyer}
                    </div>

                    <div
                      className={`rounded-xl border px-3 py-2 text-sm ${coverageTone(
                        row.buying_committee.coverage.has_champion
                      )}`}
                    >
                      Champion: {row.buying_committee.roles.champion}
                    </div>

                    <div
                      className={`rounded-xl border px-3 py-2 text-sm ${coverageTone(
                        row.buying_committee.coverage.has_operator
                      )}`}
                    >
                      Operator: {row.buying_committee.roles.operator}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Top Contact</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {row.highest_priority_contact_name || "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Priority {row.highest_priority_score} • Last account activity{" "}
                    {formatDateTime(row.most_recent_activity_at)}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/accounts/${row.account_id}`}
                    className="crm-button px-4 py-2 text-sm"
                  >
                    Open Workspace
                  </Link>

                  {row.highest_priority_contact_id ? (
                    <Link
                      href={`/contacts/${row.highest_priority_contact_id}`}
                      className="crm-button px-4 py-2 text-sm"
                    >
                      Open Top Contact
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void runAccountAction(row.account_id, "work_hottest_contact")
                    }
                    className="crm-button px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {isBusy ? "Working..." : "Work Hottest Contact"}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void runAccountAction(row.account_id, "create_account_task")
                    }
                    className="crm-button px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {isBusy ? "Working..." : "Create Account Task"}
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void runAccountAction(row.account_id, "find_missing_buyer")
                    }
                    className="crm-button px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {isBusy ? "Working..." : "Find Missing Buyer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
