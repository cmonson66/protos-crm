"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Role = "admin" | "manager" | "rep";
type Vertical = "coaching" | "corporate";

type MeResponse = {
  user_id: string;
  role: Role;
  is_active: boolean;
};

type ContactRow = {
  id: string;
  vertical?: Vertical | null;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  job_title_raw: string | null;
  sport: string;
  status: string;
  cadence_status: string;
  cadence_next_due_at: string | null;
  school_name: string | null;
  account_name?: string | null;
  org_name?: string | null;
  assigned_to_user_id: string | null;
  updated_at: string | null;
  last_activity_at: string | null;
  priority_score: number;
  school_tier: number | null;
  cadence_step: number;
  momentum_label?: "Rising" | "Warm" | "Cooling" | "Cold";
  momentum_score?: number;
  priority_reason?: string;
};

type CadenceOption = {
  key: string;
  name: string;
  vertical: Vertical;
  is_active: boolean;
  updated_at: string | null;
};

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

type ContactsListResponse = {
  data: ContactRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort_by?: string;
  sort_dir?: string;
};

type SortBy =
  | "priority"
  | "last_touch"
  | "cadence_step"
  | "updated_at"
  | "name"
  | "momentum";

type SortDir = "asc" | "desc";

type PriorityBreakdownRow = {
  label: string;
  points: number;
};

type RowNote = {
  id: string;
  body: string;
  occurred_at: string;
  created_at?: string | null;
};

type RowDetailsResponse = {
  contact: {
    id: string;
    full_name: string;
    vertical?: Vertical | null;
    school_name: string | null;
    account_name?: string | null;
    org_name?: string | null;
    sport: string | null;
    status: string;
    cadence_key: string | null;
    cadence_step: number | null;
    cadence_status: string | null;
    cadence_next_due_at: string | null;
    priority_score: number;
    school_tier: number | null;
  };
  lastActivity: {
    id: string;
    type: string;
    occurred_at: string;
    subject: string | null;
    body: string | null;
    outcome: string | null;
  } | null;
  priorityBreakdown: PriorityBreakdownRow[];
  cadencePreview: {
    cadence_key: string;
    step: number;
    subject: string | null;
    body: string | null;
    due_offset_days: number | null;
  } | null;
  nextBestAction: {
    kind:
      | "open_contact"
      | "start_cadence"
      | "restart_cadence"
      | "open_cadence_step"
      | "change_status";
    label: string;
  } | null;
  notes: RowNote[];
};

const SAVED_VIEWS = [
  { key: "my_new_contacts", label: "My New Contacts" },
  { key: "cadence_active", label: "Cadence Active" },
  { key: "needs_follow_up", label: "Needs Follow-Up" },
  { key: "stale_contacts", label: "Stale Contacts" },
  { key: "secured_active", label: "Secured/Active" },
  { key: "do_not_contact", label: "Do Not Contact" },
] as const;

const STATUS_OPTIONS = ["New", "Secured/Active", "Closed/Do Not Contact"] as const;

function daysSince(ts: string | null) {
  if (!ts) return "Never touched";
  const d = new Date(ts).getTime();
  const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function sortLabel(sortBy: SortBy) {
  switch (sortBy) {
    case "priority":
      return "Priority";
    case "last_touch":
      return "Last Touch";
    case "cadence_step":
      return "Cadence Step";
    case "updated_at":
      return "Updated";
    case "name":
      return "Name";
    case "momentum":
      return "Momentum";
    default:
      return "Priority";
  }
}

function momentumStyles(label?: ContactRow["momentum_label"]) {
  switch (label) {
    case "Rising":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Warm":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cooling":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "Cold":
      return "bg-slate-50 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function getRowVertical(row: ContactRow): Vertical {
  return row.vertical === "corporate" ? "corporate" : "coaching";
}

function getRowOrgName(row: ContactRow) {
  return row.org_name || row.account_name || row.school_name || null;
}

function getRowOrgLabel(row: ContactRow) {
  return getRowVertical(row) === "corporate" ? "Account" : "School";
}

function getDetailVertical(details: RowDetailsResponse["contact"]): Vertical {
  return details.vertical === "corporate" ? "corporate" : "coaching";
}

function getDetailOrgName(details: RowDetailsResponse["contact"]) {
  return details.org_name || details.account_name || details.school_name || null;
}

function getDetailOrgLabel(details: RowDetailsResponse["contact"]) {
  return getDetailVertical(details) === "corporate" ? "Account" : "School";
}

export default function ContactsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

const [rows, setRows] = useState<ContactRow[]>([]);
const [reps, setReps] = useState<RepRow[]>([]);
const [cadenceOptions, setCadenceOptions] = useState<CadenceOption[]>([]);
  

  const [q, setQ] = useState("");
  const [sport, setSport] = useState("");
  const [status, setStatus] = useState("");
  const [cadenceStatus, setCadenceStatus] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAssignedToUserId, setBulkAssignedToUserId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkCadenceKey, setBulkCadenceKey] = useState("");

  const [activeView, setActiveView] = useState<string>("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [rowDetailsById, setRowDetailsById] = useState<
    Record<string, RowDetailsResponse | undefined>
  >({});
  const [rowDetailsLoadingId, setRowDetailsLoadingId] = useState<string | null>(null);
  const [rowNoteDrafts, setRowNoteDrafts] = useState<Record<string, string>>({});
  const [rowNoteBusyId, setRowNoteBusyId] = useState<string | null>(null);

  const isPrivileged = me?.role === "admin" || me?.role === "manager";
  const canAssign = isPrivileged;
  const canBulkOperate = isPrivileged;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);



  async function loadMe() {
    const res = await fetchWithAuth("/api/auth/me");
    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      setMe(json as MeResponse);
    }
  }

  async function loadReps() {
    const res = await fetchWithAuth("/api/reps/list");
    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      setReps((json.data ?? []) as RepRow[]);
    } else {
      setReps([]);
    }
  }

async function loadCadences() {
  const res = await fetchWithAuth("/api/cadence/list");
  const json = await res.json().catch(() => ({}));

  if (res.ok) {
    setCadenceOptions((json.data ?? []) as CadenceOption[]);
  } else {
    setCadenceOptions([]);
  }
}


  async function load(
    nextPage?: number,
    overrideSortBy?: SortBy,
    overrideSortDir?: SortDir
  ) {
    setLoading(true);
    setErr(null);

    const currentPage = nextPage ?? page;
    const activeSortBy = overrideSortBy ?? sortBy;
    const activeSortDir = overrideSortDir ?? sortDir;

    const params = new URLSearchParams();

    if (q.trim()) params.set("q", q.trim());
    if (sport) params.set("sport", sport);
    if (status) params.set("status", status);
    if (cadenceStatus) params.set("cadence_status", cadenceStatus);

    if (canAssign) {
      if (unassignedOnly) {
        params.set("unassigned", "1");
      } else if (assignedToUserId) {
        params.set("assigned_to_user_id", assignedToUserId);
      }
    }

    if (staleOnly) params.set("stale", "1");

    params.set("sort_by", activeSortBy);
    params.set("sort_dir", activeSortDir);

    params.set("page", String(currentPage));
    params.set("pageSize", String(pageSize));

    const url = `/api/contacts/list?${params.toString()}`;
    const res = await fetchWithAuth(url);
    const json = (await res.json().catch(() => ({}))) as Partial<ContactsListResponse> & {
      error?: string;
    };

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load contacts");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((json.data ?? []) as ContactRow[]);
    setPage(json.page ?? currentPage);
    setPageSize(json.pageSize ?? pageSize);
    setTotal(json.total ?? 0);
    setTotalPages(json.totalPages ?? 1);
    setLoading(false);
  }

useEffect(() => {
  void loadMe();
  void loadReps();
  void loadCadences();
  void load(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const sports = useMemo(() => {
    const vals = Array.from(
      new Set(rows.map((r) => (r.sport || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return vals;
  }, [rows]);

  const allSelected = useMemo(() => {
    return rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  }, [rows, selectedIds]);

  const selectedRows = useMemo(() => {
    return rows.filter((r) => selectedIds.includes(r.id));
  }, [rows, selectedIds]);

  const selectedVerticals = useMemo(() => {
    return Array.from(new Set(selectedRows.map((r) => getRowVertical(r))));
  }, [selectedRows]);

  const bulkSelectionVertical = useMemo<Vertical | "mixed" | null>(() => {
    if (selectedRows.length === 0) return null;
    if (selectedVerticals.length > 1) return "mixed";
    return selectedVerticals[0] ?? null;
  }, [selectedRows, selectedVerticals]);

  const filteredBulkCadenceOptions = useMemo(() => {
    if (bulkSelectionVertical === "mixed") return [];
    if (!bulkSelectionVertical) return cadenceOptions;
    return cadenceOptions.filter((c) => c.vertical === bulkSelectionVertical);
  }, [cadenceOptions, bulkSelectionVertical]);

  useEffect(() => {
    if (bulkSelectionVertical === "mixed") {
      setBulkCadenceKey("");
      return;
    }

    if (
      bulkCadenceKey &&
      !filteredBulkCadenceOptions.some((c) => c.key === bulkCadenceKey)
    ) {
      setBulkCadenceKey("");
    }
  }, [bulkSelectionVertical, bulkCadenceKey, filteredBulkCadenceOptions]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];

    if (q.trim()) chips.push({ key: "q", label: `Search: ${q.trim()}`, clear: () => setQ("") });
    if (sport) chips.push({ key: "sport", label: `Sport: ${sport}`, clear: () => setSport("") });
    if (status) chips.push({ key: "status", label: `Status: ${status}`, clear: () => setStatus("") });
    if (cadenceStatus) {
      chips.push({
        key: "cadence_status",
        label: `Cadence: ${cadenceStatus}`,
        clear: () => setCadenceStatus(""),
      });
    }

    if (canAssign && assignedToUserId) {
      const rep =
        reps.find((r) => r.user_id === assignedToUserId)?.full_name ||
        reps.find((r) => r.user_id === assignedToUserId)?.email ||
        assignedToUserId;

      chips.push({
        key: "assigned_to_user_id",
        label: `Assigned: ${rep}`,
        clear: () => setAssignedToUserId(""),
      });
    }

    if (canAssign && unassignedOnly) {
      chips.push({
        key: "unassigned",
        label: "Unassigned Only",
        clear: () => setUnassignedOnly(false),
      });
    }

    if (staleOnly) {
      chips.push({
        key: "stale",
        label: "Stale Contacts",
        clear: () => setStaleOnly(false),
      });
    }

    chips.push({
      key: "sort_by",
      label: `Sort: ${sortLabel(sortBy)} ${sortDir === "asc" ? "↑" : "↓"}`,
      clear: () => {
        setSortBy("priority");
        setSortDir("desc");
      },
    });

    return chips;
  }, [
    q,
    sport,
    status,
    cadenceStatus,
    assignedToUserId,
    unassignedOnly,
    staleOnly,
    sortBy,
    sortDir,
    reps,
    canAssign,
  ]);

  function clearFilters() {
    setQ("");
    setSport("");
    setStatus("");
    setCadenceStatus("");
    setAssignedToUserId("");
    setUnassignedOnly(false);
    setStaleOnly(false);
    setSortBy("priority");
    setSortDir("desc");
    setActiveView("");
    setPage(1);
  }

  function applySavedView(viewKey: string) {
    setQ("");
    setSport("");
    setStatus("");
    setCadenceStatus("");
    setAssignedToUserId("");
    setUnassignedOnly(false);
    setStaleOnly(false);
    setSortBy("priority");
    setSortDir("desc");
    setActiveView(viewKey);
    setPage(1);

    switch (viewKey) {
      case "my_new_contacts":
        setStatus("New");
        break;
      case "cadence_active":
        setCadenceStatus("active");
        break;
      case "needs_follow_up":
        setStatus("New");
        setCadenceStatus("inactive");
        break;
      case "stale_contacts":
        setStaleOnly(true);
        setSortBy("last_touch");
        setSortDir("asc");
        break;
      case "secured_active":
        setStatus("Secured/Active");
        break;
      case "do_not_contact":
        setStatus("Closed/Do Not Contact");
        break;
    }

    setTimeout(() => void load(1), 0);
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(rows.map((r) => r.id));
  }

  async function runBulkAction(
    action: "assign" | "status" | "start_cadence" | "restart_cadence" | "stop_cadence"
  ) {
    if (!canBulkOperate) {
      setErr("Bulk operations are restricted.");
      return;
    }

    if (selectedIds.length === 0) {
      setErr("Select at least one contact.");
      return;
    }

    setBusy(true);
    setErr(null);

    const body: any = { contact_ids: selectedIds, action };

    if (action === "assign") body.assigned_to_user_id = bulkAssignedToUserId || null;

    if (action === "status") {
      if (!bulkStatus) {
        setErr("Choose a status first.");
        setBusy(false);
        return;
      }
      body.status = bulkStatus;
    }

    if (action === "start_cadence" || action === "restart_cadence") {
      if (!bulkCadenceKey) {
        setErr("Choose a cadence first.");
        setBusy(false);
        return;
      }
      body.cadence_key = bulkCadenceKey;
    }

    const res = await fetchWithAuth("/api/contacts/bulk-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Bulk action failed");
      setBusy(false);
      return;
    }

    setToast(json?.message ?? "Bulk update complete");
    setSelectedIds([]);
    setBusy(false);
    await load(page);

    if (expandedRowId) {
      void loadRowDetails(expandedRowId, true);
    }
  }

  async function claimContact(contactId: string) {
    setRowBusyId(contactId);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to claim contact");
      setRowBusyId(null);
      return;
    }

    setToast("Contact claimed");
    setRowBusyId(null);
    await load(page);

    if (expandedRowId === contactId) {
      void loadRowDetails(contactId, true);
    }
  }

  async function setContactStatus(contactId: string, nextStatus: string) {
    setRowBusyId(contactId);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/set-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, status: nextStatus }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to update status");
      setRowBusyId(null);
      return;
    }

    setToast(`Status set to ${nextStatus}`);
    setRowBusyId(null);
    await load(page);

    if (expandedRowId === contactId) {
      void loadRowDetails(contactId, true);
    }
  }

  async function startCadence(contactId: string, forceRestart: boolean) {
    setRowBusyId(contactId);
    setErr(null);

    const res = await fetchWithAuth("/api/cadence/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        cadence_key: "protos_prospecting_v1",
        force_restart: forceRestart,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to start cadence");
      setRowBusyId(null);
      return;
    }

    setToast(forceRestart ? "Cadence restarted" : "Cadence started");
    setRowBusyId(null);
    await load(page);

    if (expandedRowId === contactId) {
      void loadRowDetails(contactId, true);
    }
  }

  async function loadRowDetails(contactId: string, force = false) {
    if (!force && rowDetailsById[contactId]) return;

    setRowDetailsLoadingId(contactId);

    const res = await fetchWithAuth(`/api/contacts/${contactId}/row-details`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load row details");
      setRowDetailsLoadingId(null);
      return;
    }

    setRowDetailsById((prev) => ({
      ...prev,
      [contactId]: json as RowDetailsResponse,
    }));
    setRowDetailsLoadingId(null);
  }

  async function toggleExpandRow(contactId: string) {
    if (expandedRowId === contactId) {
      setExpandedRowId(null);
      return;
    }

    setExpandedRowId(contactId);
    await loadRowDetails(contactId);
  }

  async function saveQuickNote(contactId: string) {
    const body = (rowNoteDrafts[contactId] || "").trim();
    if (!body) return;

    setRowNoteBusyId(contactId);
    setErr(null);

    const res = await fetchWithAuth(`/api/contacts/${contactId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to save note");
      setRowNoteBusyId(null);
      return;
    }

    setRowNoteDrafts((prev) => ({ ...prev, [contactId]: "" }));
    setToast("Note saved");
    setRowNoteBusyId(null);
    await loadRowDetails(contactId, true);
    await load(page);
  }

  function exportCsv() {
    const exportRows = rows.filter(
      (r) => selectedIds.length === 0 || selectedIds.includes(r.id)
    );

    const header = [
      "Vertical",
      "Organization",
      "First Name",
      "Last Name",
      "Email",
      "Job Title",
      "Sport / Focus",
      "Status",
      "Cadence Status",
      "Cadence Step",
      "Priority Score",
      "School Tier",
      "Momentum",
      "Momentum Score",
      "Priority Reason",
      "Assigned To User ID",
      "Last Activity At",
      "Updated At",
    ];

    const lines = exportRows.map((r) => [
      getRowVertical(r),
      getRowOrgName(r) ?? "",
      r.first_name ?? "",
      r.last_name ?? "",
      r.primary_email ?? "",
      r.job_title_raw ?? "",
      r.sport ?? "",
      r.status ?? "",
      r.cadence_status ?? "",
      r.cadence_step ?? 0,
      r.priority_score ?? 0,
      r.school_tier ?? "",
      r.momentum_label ?? "",
      r.momentum_score ?? "",
      r.priority_reason ?? "",
      r.assigned_to_user_id ?? "",
      r.last_activity_at ?? "",
      r.updated_at ?? "",
    ]);

    const csv = [header, ...lines]
      .map((row) =>
        row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts_export.csv";
    a.click();
    URL.revokeObjectURL(url);

    setToast("CSV exported");
  }

  function handleHeaderSort(column: SortBy) {
    const nextDir: SortDir =
      sortBy === column ? (sortDir === "asc" ? "desc" : "asc") : "desc";

    setSortBy(column);
    setSortDir(nextDir);
    setPage(1);
    setTimeout(() => void load(1, column, nextDir), 0);
  }

  function headerArrow(column: SortBy) {
    if (sortBy !== column) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  return (
    <div>
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-4xl font-semibold">Contacts</h1>
<div className="flex gap-2">
  <Link href="/contacts/new" className="rounded-xl border px-5 py-3 hover:bg-slate-50">
    New Contact
  </Link>

  <Link href="/contacts/import" className="rounded-xl border px-5 py-3 hover:bg-slate-50">
    Import CSV
  </Link>

  <Link href="/accounts" className="rounded-xl border px-5 py-3 hover:bg-slate-50">
    Accounts Radar
  </Link>

  <Link href="/work" className="rounded-xl border px-5 py-3 hover:bg-slate-50">
    Work Queue
  </Link>

  <button onClick={() => void load(page)} className="rounded-xl border px-5 py-3">
    Refresh
  </button>
</div>

      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold">Saved Views</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SAVED_VIEWS.map((view) => (
            <button
              key={view.key}
              onClick={() => applySavedView(view.key)}
              className={`rounded-xl border px-4 py-2 ${
                activeView === view.key ? "bg-slate-100" : ""
              }`}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name/email..."
          className="rounded-xl border px-4 py-3"
        />

        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="">All sports / focus</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="">All statuses</option>
          <option value="New">New</option>
          <option value="Secured/Active">Secured/Active</option>
          <option value="Closed/Do Not Contact">Closed/Do Not Contact</option>
        </select>

        <select
          value={cadenceStatus}
          onChange={(e) => setCadenceStatus(e.target.value)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="">All cadence states</option>
          <option value="inactive">inactive</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="stopped">stopped</option>
          <option value="completed">completed</option>
        </select>

        {canAssign ? (
          <>
            <select
              value={assignedToUserId}
              onChange={(e) => {
                setAssignedToUserId(e.target.value);
                if (e.target.value) setUnassignedOnly(false);
              }}
              className="rounded-xl border px-4 py-3"
            >
              <option value="">All assigned reps</option>
              {reps
                .filter((r) => r.is_active)
                .map((r) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.full_name || r.email || r.user_id}
                  </option>
                ))}
            </select>

            <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
              <input
                id="unassignedOnly"
                type="checkbox"
                checked={unassignedOnly}
                onChange={(e) => {
                  setUnassignedOnly(e.target.checked);
                  if (e.target.checked) setAssignedToUserId("");
                }}
              />
              <label htmlFor="unassignedOnly" className="text-sm">
                Unassigned only
              </label>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <input
              id="staleOnly"
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => setStaleOnly(e.target.checked)}
            />
            <label htmlFor="staleOnly" className="text-sm">
              Stale only
            </label>
          </div>
        )}
      </div>

      {canAssign ? (
        <div className="mt-3">
          <label className="flex w-fit items-center gap-3 rounded-xl border px-4 py-3">
            <input
              id="staleOnlyPrivileged"
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => setStaleOnly(e.target.checked)}
            />
            <span className="text-sm">Stale contacts only</span>
          </label>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="priority">Sort by Priority</option>
          <option value="momentum">Sort by Momentum</option>
          <option value="last_touch">Sort by Last Touch</option>
          <option value="cadence_step">Sort by Cadence Step</option>
          <option value="updated_at">Sort by Updated</option>
          <option value="name">Sort by Name</option>
        </select>

        <select
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as SortDir)}
          className="rounded-xl border px-4 py-3"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setPage(1);
              void load(1);
            }}
            className="rounded-xl border px-5 py-3"
          >
            Apply filters
          </button>
          <button
            onClick={() => {
              clearFilters();
              setTimeout(() => void load(1), 0);
            }}
            className="rounded-xl border px-5 py-3"
          >
            Clear filters
          </button>
        </div>
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-semibold">Active Filters</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => {
                  chip.clear();
                  setPage(1);
                  setTimeout(() => void load(1), 0);
                }}
                className="rounded-full border px-3 py-1 text-sm"
              >
                {chip.label} ×
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {canBulkOperate ? (
        <div className="mt-6 rounded-2xl border p-5">
          <div className="text-lg font-semibold">Bulk Actions</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Selected contacts: <span className="font-semibold">{selectedIds.length}</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={bulkAssignedToUserId}
              onChange={(e) => setBulkAssignedToUserId(e.target.value)}
              className="rounded-xl border px-4 py-3"
            >
              <option value="">Assign to rep...</option>
              <option value="">Unassigned</option>
              {reps
                .filter((r) => r.is_active)
                .map((r) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.full_name || r.email || r.user_id}
                  </option>
                ))}
            </select>

            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="rounded-xl border px-4 py-3"
            >
              <option value="">Change status...</option>
              <option value="New">New</option>
              <option value="Secured/Active">Secured/Active</option>
              <option value="Closed/Do Not Contact">Closed/Do Not Contact</option>
            </select>

            <select

  value={bulkCadenceKey}
  onChange={(e) => setBulkCadenceKey(e.target.value)}
  className="rounded-xl border px-4 py-3"
  disabled={bulkSelectionVertical === "mixed"}
>
  <option value="">
    {bulkSelectionVertical === "mixed"
      ? "Mixed vertical selection"
      : bulkSelectionVertical
        ? `Select ${bulkSelectionVertical} cadence...`
        : "Select cadence..."}
  </option>
  {filteredBulkCadenceOptions.map((c) => (
    <option key={c.key} value={c.key}>
      {c.name} ({c.key})
    </option>
  ))}
</select>

            <button onClick={exportCsv} className="rounded-xl border px-4 py-3">
              Export CSV
            </button>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            Bulk cadence actions use the cadence selected above.
          </div>

  {bulkSelectionVertical === "mixed" ? (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      Selected contacts include both coaching and corporate records. Bulk cadence actions require a single vertical selection.
    </div>
  ) : bulkSelectionVertical ? (
    <div className="mt-3 text-sm text-muted-foreground">
      Bulk cadence selection is filtered to <span className="font-semibold">{bulkSelectionVertical}</span> cadences.
    </div>
  ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => void runBulkAction("assign")}
              className="rounded-xl border px-4 py-2"
            >
              Bulk Assign Rep
            </button>
            <button
              disabled={busy}
              onClick={() => void runBulkAction("status")}
              className="rounded-xl border px-4 py-2"
            >
              Bulk Change Status
            </button>
<button
  disabled={busy || bulkSelectionVertical === "mixed"}
  onClick={() => void runBulkAction("start_cadence")}
  className="rounded-xl border px-4 py-2 disabled:opacity-50"
>
  Bulk Start Cadence
</button>
            <button
  disabled={busy || bulkSelectionVertical === "mixed"}
  onClick={() => void runBulkAction("restart_cadence")}
  className="rounded-xl border px-4 py-2 disabled:opacity-50"
>
  Bulk Restart Cadence
</button>
            <button
              disabled={busy}
              onClick={() => void runBulkAction("stop_cadence")}
              className="rounded-xl border px-4 py-2"
            >
              Bulk Stop Cadence
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Export</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Export your visible contacts.
              </div>
            </div>
            <button onClick={exportCsv} className="rounded-xl border px-4 py-3">
              Export CSV
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? "Loading..." : `Showing ${rows.length} of ${total} contacts`}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page size</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const next = Number(e.target.value || 25);
              setPageSize(next);
              setPage(1);
              setTimeout(() => void load(1), 0);
            }}
            className="rounded-xl border px-3 py-2"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {loading ? <div className="mt-6 text-muted-foreground">Loading...</div> : null}
      {err ? <div className="mt-6 text-red-600">{err}</div> : null}

      <div className="mt-6 space-y-3">
        <div className="overflow-hidden rounded-2xl border">
          <div className="grid grid-cols-[56px_120px_1.5fr_120px_140px_150px_130px_150px_320px] border-b bg-slate-50">
            <div className="border-r p-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={!canBulkOperate}
              />
            </div>

            <div className="border-r p-3 text-left text-sm font-semibold">Inspect</div>

            <button
              type="button"
              onClick={() => handleHeaderSort("name")}
              className="border-r p-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              Contact {headerArrow("name")}
            </button>

            <button
              type="button"
              onClick={() => handleHeaderSort("priority")}
              className="border-r p-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              Priority {headerArrow("priority")}
            </button>

            <button
              type="button"
              onClick={() => handleHeaderSort("momentum")}
              className="border-r p-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              Momentum {headerArrow("momentum")}
            </button>

            <button
              type="button"
              onClick={() => handleHeaderSort("last_touch")}
              className="border-r p-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              Last Touch {headerArrow("last_touch")}
            </button>

            <button
              type="button"
              onClick={() => handleHeaderSort("cadence_step")}
              className="border-r p-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              Cadence Step {headerArrow("cadence_step")}
            </button>

            <button
              type="button"
              onClick={() => handleHeaderSort("updated_at")}
              className="border-r p-3 text-left text-sm font-semibold hover:bg-slate-100"
            >
              Updated {headerArrow("updated_at")}
            </button>

            <div className="p-3 text-left text-sm font-semibold">Quick Actions</div>
          </div>

          {rows.map((c) => {
            const fullName =
              `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(No name)";
            const orgName = getRowOrgName(c);
            const orgLabel = getRowOrgLabel(c);
            const vertical = getRowVertical(c);
            const title = orgName ? `${orgName} — ${fullName}` : fullName;

            const assignedLabel =
              reps.find((r) => r.user_id === c.assigned_to_user_id)?.full_name ||
              reps.find((r) => r.user_id === c.assigned_to_user_id)?.email ||
              c.assigned_to_user_id ||
              "Unassigned";

            const rowBusy = rowBusyId === c.id;
            const isAssignedToMe = !!me?.user_id && c.assigned_to_user_id === me.user_id;
            const canClaim = !c.assigned_to_user_id;
            const canWorkRow = isPrivileged || isAssignedToMe;
            const canStartCadence = canWorkRow && c.status === "New" && c.cadence_status !== "active";
            const canRestartCadence = canWorkRow && c.status === "New" && c.cadence_status === "active";
            const canChangeStatus = canWorkRow;
            const canSaveNote = canWorkRow;
            const isExpanded = expandedRowId === c.id;
            const details = rowDetailsById[c.id];
            const isDetailsLoading = rowDetailsLoadingId === c.id;
            const noteBusy = rowNoteBusyId === c.id;

            return (
              <div key={c.id}>
                <div className="grid grid-cols-[56px_120px_1.5fr_120px_140px_150px_130px_150px_320px] border-b">
                  <div className="border-r p-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleSelectOne(c.id)}
                      disabled={!canBulkOperate}
                    />
                  </div>

                  <div className="border-r p-4">
                    <button
                      type="button"
                      onClick={() => void toggleExpandRow(c.id)}
                      className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>

                  <Link
                    href={`/contacts/${c.id}`}
                    className="block border-r p-5 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-base font-semibold">{title}</div>

                      <div className="mt-1 text-sm text-muted-foreground">
                        {c.primary_email ?? ""}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border px-2 py-1 capitalize">
                          {vertical}
                        </span>
                        {orgName ? (
                          <>
                            <span>•</span>
                            <span>
                              {orgLabel}: {orgName}
                            </span>
                          </>
                        ) : null}
                        <span>•</span>
                        <span>{c.sport}</span>
                        <span>•</span>
                        <span>{c.status}</span>
                        <span>•</span>
                        <span>{c.cadence_status}</span>
                        {c.school_tier ? (
                          <>
                            <span>•</span>
                            <span>Tier {c.school_tier}</span>
                          </>
                        ) : null}
                      </div>

                      <div className="mt-2 text-xs">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2 py-1 font-medium",
                            momentumStyles(c.momentum_label),
                          ].join(" ")}
                        >
                          {c.momentum_label || "Cold"}
                          {typeof c.momentum_score === "number"
                            ? ` • ${c.momentum_score}`
                            : ""}
                        </span>
                      </div>

                      {c.priority_reason ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Why: {c.priority_reason}
                        </div>
                      ) : null}

                      <div className="mt-1 text-xs text-muted-foreground">
                        Assigned: {assignedLabel}
                      </div>
                    </div>
                  </Link>

                  <div className="border-r p-5">
                    <div className="inline-block rounded-full border px-3 py-1 text-xs font-semibold">
                      {c.priority_score}
                    </div>
                  </div>

                  <div className="border-r p-5">
                    <div
                      className={[
                        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                        momentumStyles(c.momentum_label),
                      ].join(" ")}
                    >
                      {c.momentum_label || "Cold"}
                    </div>
                  </div>

                  <div className="border-r p-5 text-sm text-muted-foreground">
                    {daysSince(c.last_activity_at)}
                  </div>

                  <div className="border-r p-5 text-sm text-muted-foreground">
                    {c.cadence_step > 0 ? `Step ${c.cadence_step}` : "—"}
                  </div>

                  <div className="border-r p-5 text-sm text-muted-foreground">
                    {c.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}
                  </div>

                  <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        Open
                      </Link>

                      {canClaim ? (
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => void claimContact(c.id)}
                          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                        >
                          {rowBusy ? "Working..." : "Claim"}
                        </button>
                      ) : null}

                      {canStartCadence ? (
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => void startCadence(c.id, false)}
                          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                        >
                          {rowBusy ? "Working..." : "Start cadence"}
                        </button>
                      ) : null}

                      {canRestartCadence ? (
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => void startCadence(c.id, true)}
                          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                        >
                          {rowBusy ? "Working..." : "Restart cadence"}
                        </button>
                      ) : null}

                      {canChangeStatus ? (
                        <select
                          disabled={rowBusy}
                          defaultValue=""
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!next) return;
                            e.currentTarget.value = "";
                            void setContactStatus(c.id, next);
                          }}
                          className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                        >
                          <option value="">Change status</option>
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {!canWorkRow && !canClaim ? (
                        <div className="self-center text-xs text-muted-foreground">
                          Assigned elsewhere
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-b bg-slate-50/60 px-6 py-5">
                    {isDetailsLoading && !details ? (
                      <div className="text-sm text-muted-foreground">
                        Loading row details...
                      </div>
                    ) : details ? (
                      <div className="grid gap-4 xl:grid-cols-5">
                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-sm font-semibold">Last Activity</div>
                          {details.lastActivity ? (
                            <div className="mt-3">
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                {details.lastActivity.type}
                              </div>
                              <div className="mt-1 text-sm font-medium">
                                {details.lastActivity.subject || "No subject"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(details.lastActivity.occurred_at)}
                              </div>
                              {details.lastActivity.body ? (
                                <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                                  {details.lastActivity.body}
                                </div>
                              ) : null}
                              {details.lastActivity.outcome ? (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Outcome: {details.lastActivity.outcome}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-muted-foreground">
                              No activity logged yet.
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-sm font-semibold">Priority Explanation</div>
                          <div className="mt-2 text-2xl font-semibold">
                            {details.contact.priority_score}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground capitalize">
                            {getDetailVertical(details.contact)}
                            {getDetailOrgName(details.contact)
                              ? ` • ${getDetailOrgLabel(details.contact)}: ${getDetailOrgName(details.contact)}`
                              : ""}
                          </div>
                          <div className="mt-3 space-y-2">
                            {details.priorityBreakdown.length > 0 ? (
                              details.priorityBreakdown.map((item, idx) => (
                                <div
                                  key={`${item.label}-${idx}`}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <div>{item.label}</div>
                                  <div className="font-semibold">
                                    {item.points >= 0 ? `+${item.points}` : item.points}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                No breakdown available.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-sm font-semibold">Cadence Preview</div>
                          {details.cadencePreview ? (
                            <div className="mt-3">
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                {details.cadencePreview.cadence_key}
                              </div>
                              <div className="mt-1 text-sm font-medium">
                                Step {details.cadencePreview.step}
                              </div>
                              <div className="mt-2 text-sm">
                                {details.cadencePreview.subject || "No subject"}
                              </div>
                              {details.cadencePreview.body ? (
                                <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                                  {details.cadencePreview.body}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-muted-foreground">
                              No active cadence preview.
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-sm font-semibold">Next Best Action</div>
                          <div className="mt-3 text-sm">
                            {details.nextBestAction?.label || "Open contact"}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                              href={`/contacts/${c.id}`}
                              className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                            >
                              Open contact
                            </Link>

                            {details.nextBestAction?.kind === "start_cadence" && canStartCadence ? (
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void startCadence(c.id, false)}
                                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                              >
                                {rowBusy ? "Working..." : "Start cadence"}
                              </button>
                            ) : null}

                            {details.nextBestAction?.kind === "restart_cadence" && canRestartCadence ? (
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void startCadence(c.id, true)}
                                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                              >
                                {rowBusy ? "Working..." : "Restart cadence"}
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                            Status: {details.contact.status} • Cadence:{" "}
                            {details.contact.cadence_status || "—"}
                            {details.contact.cadence_step
                              ? ` • Step ${details.contact.cadence_step}`
                              : ""}
                          </div>
                        </div>

                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-sm font-semibold">Quick Notes</div>

                          {canSaveNote ? (
                            <div className="mt-3 space-y-3">
                              <textarea
                                value={rowNoteDrafts[c.id] || ""}
                                onChange={(e) =>
                                  setRowNoteDrafts((prev) => ({
                                    ...prev,
                                    [c.id]: e.target.value,
                                  }))
                                }
                                placeholder="Add a fast manager or rep note..."
                                className="min-h-[110px] w-full rounded-xl border px-3 py-2 text-sm"
                              />

                              <button
                                type="button"
                                disabled={noteBusy || !(rowNoteDrafts[c.id] || "").trim()}
                                onClick={() => void saveQuickNote(c.id)}
                                className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                              >
                                {noteBusy ? "Saving..." : "Save note"}
                              </button>
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-muted-foreground">
                              Claim or be assigned this contact to add notes.
                            </div>
                          )}

                          <div className="mt-4 space-y-3">
                            {details.notes.length > 0 ? (
                              details.notes.map((note) => (
                                <div key={note.id} className="rounded-xl border p-3">
                                  <div className="whitespace-pre-wrap text-sm text-slate-700">
                                    {note.body}
                                  </div>
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {formatDateTime(note.occurred_at || note.created_at)}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground">No notes yet.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No row details available.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!loading && !err && rows.length === 0 ? (
          <div className="text-muted-foreground">No contacts found.</div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          disabled={page <= 1 || loading}
          onClick={() => void load(page - 1)}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
        >
          Previous
        </button>

        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </div>

        <button
          disabled={page >= totalPages || loading}
          onClick={() => void load(page + 1)}
          className="rounded-xl border px-4 py-2 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}