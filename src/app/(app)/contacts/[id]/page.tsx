"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import CadenceStatusBanner from "@/components/cadence/CadenceStatusBanner";
import AccountIntelligencePanel from "@/components/AccountIntelligencePanel";

type ContactVertical = "coaching" | "corporate";

type Contact = {
  id: string;
  school_id: string | null;
  account_id: string | null;
  buying_committee_role_override: string | null;
  vertical: ContactVertical;
  sport: string;
  division: string | null;
  conference: string | null;
  region: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title_raw: string | null;
  primary_email: string | null;
  phone: string | null;
  active: boolean;
  owner_user_id: string | null;
  assigned_to_user_id: string | null;
  status: string;
  cadence_key: string | null;
  cadence_step: number;
  cadence_status: string;
  cadence_next_due_at: string | null;
  cadence_started_at: string | null;
  cadence_updated_at: string | null;
  last_activity_at: string | null;
  last_activity_type: string | null;
  last_activity_subject: string | null;
  rep_notes: string | null;
  created_at: string;
  updated_at: string;
};

type ContactWithOrg = Contact & {
  schools?: { name: string } | null;
  accounts?: { name: string } | null;
};

type Task = {
  id: string;
  contact_id: string;
  assigned_to_user_id: string;
  owner_user_id: string | null;
  title: string | null;
  task_type: string;
  due_at: string;
  completed_at: string | null;
  notes: string | null;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  created_at: string;
};

type Activity = {
  id: string;
  contact_id: string;
  user_id: string;
  type: string;
  occurred_at: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
};

type CadencePreview = {
  ok?: boolean;
  cadence_key: string;
  step: number;
  required_contact_status: string | null;
  subject: string;
  body: string;
  to_email: string | null;
  contact_status: string;
  cadence_status: string;
  cadence_next_due_at: string | null;
};

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

type CadenceRow = {
  key: string;
  name: string;
  vertical: "coaching" | "corporate";
  is_active: boolean;
  updated_at: string | null;
};

type SchoolRow = {
  id: string;
  name: string;
  tier: number | null;
};

type ContactPriorityDetail = {
  id: string;
  vertical?: "coaching" | "corporate";
  school_name: string | null;
  account_name?: string | null;
  industry?: string | null;
  company_size?: string | null;
  school_tier: number;
  status: string;
  cadence_status: string;
  cadence_step: number;
  last_activity_at: string | null;
  score: number;
  response_likelihood_score: number;
  cadence_score: number;
  recency_score: number;
  school_tier_score: number;
  conversion_history_score: number;
};

type AccountIntelligenceResponse = {
  account: {
    id: string;
    name: string;
    industry: string | null;
    company_size: string | null;
    hq_location: string | null;
    website: string | null;
    active: boolean;
    created_at: string | null;
    updated_at: string | null;
  };
  summary: {
    total_contacts: number;
    active_cadences: number;
    stale_contacts: number;
    touched_last_7_days: number;
    secured_active_contacts: number;
    most_recent_activity_at: string | null;
    most_recent_activity_subject: string | null;
    highest_priority_contact_id: string | null;
    highest_priority_contact_name: string | null;
    highest_priority_score: number;
  };
  buying_committee: {
    total_identified_roles: number;
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
  contacts: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string;
    primary_email: string | null;
    job_title_raw: string | null;
    status: string | null;
    cadence_status: string | null;
    cadence_step: number;
    cadence_next_due_at: string | null;
    last_activity_at: string | null;
    updated_at: string | null;
    assigned_to_user_id: string | null;
    priority_score: number;
    momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
    momentum_score: number;
    priority_reason: string;
    buying_committee_role:
      | "economic_buyer"
      | "technical_buyer"
      | "champion"
      | "operator"
      | "unknown";
    buying_committee_role_label: string;
    buying_committee_confidence: "high" | "medium" | "low";
    buying_committee_source: "manual" | "inferred";
    buying_committee_role_override:
      | "economic_buyer"
      | "technical_buyer"
      | "champion"
      | "operator"
      | "unknown"
      | null;
  }[];
  recent_activity: {
    id: string;
    contact_id: string;
    type: string;
    occurred_at: string;
    subject: string | null;
    outcome: string | null;
  }[];
};

type TimelineKind =
  | "activity"
  | "task_open"
  | "task_completed"
  | "cadence_started"
  | "cadence_restarted"
  | "cadence_stopped"
  | "cadence_repaired"
  | "status_changed"
  | "assignment_changed"
  | "contact_updated";

type TimelineItem = {
  id: string;
  ts: string;
  kind: TimelineKind;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  actor_user_id?: string | null;
  actor?: string | null;
  contact_id: string;
  meta?: Record<string, unknown>;
};

type TimelineResponse = {
  contact_id: string;
  count: number;
  items: TimelineItem[];
};

type TimelineFilter =
  | "all"
  | "cadence"
  | "tasks"
  | "activity"
  | "status"
  | "assignment";

const STATUS_OPTIONS = ["New", "Secured/Active", "Closed/Do Not Contact"] as const;

const OUTCOME_OPTIONS = [
  { key: "booked_demo", label: "Booked Demo" },
  { key: "replied", label: "Replied" },
  { key: "wrong_contact", label: "Wrong Contact" },
  { key: "do_not_contact", label: "Do Not Contact" },
] as const;

function normalizeSchoolText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function daysSince(ts: string | null) {
  if (!ts) return null;
  const d = new Date(ts).getTime();
  const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function fmtDuration(seconds: number) {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function statusTone(status: string) {
  if (status === "New") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Secured/Active")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function cadenceTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "completed") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "stopped") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function timelineTone(kind: TimelineKind) {
  switch (kind) {
    case "cadence_started":
    case "cadence_restarted":
      return "border-emerald-200 bg-emerald-50";
    case "cadence_stopped":
    case "cadence_repaired":
      return "border-amber-200 bg-amber-50";
    case "status_changed":
      return "border-sky-200 bg-sky-50";
    case "assignment_changed":
      return "border-violet-200 bg-violet-50";
    case "task_open":
    case "task_completed":
      return "border-slate-200 bg-slate-50";
    default:
      return "border-slate-200 bg-white";
  }
}

function timelineLabel(kind: TimelineKind) {
  switch (kind) {
    case "cadence_started":
      return "Cadence Start";
    case "cadence_restarted":
      return "Cadence Restart";
    case "cadence_stopped":
      return "Cadence Stop";
    case "cadence_repaired":
      return "Cadence Repair";
    case "status_changed":
      return "Status";
    case "assignment_changed":
      return "Assignment";
    case "contact_updated":
      return "Contact Update";
    case "task_open":
      return "Task Created";
    case "task_completed":
      return "Task Completed";
    default:
      return "Activity";
  }
}

function timelineIcon(kind: TimelineKind) {
  switch (kind) {
    case "cadence_started":
      return "▶";
    case "cadence_restarted":
      return "↻";
    case "cadence_stopped":
      return "■";
    case "cadence_repaired":
      return "🛠";
    case "status_changed":
      return "●";
    case "assignment_changed":
      return "⇄";
    case "contact_updated":
      return "✎";
    case "task_open":
      return "☐";
    case "task_completed":
      return "☑";
    default:
      return "•";
  }
}

function isTimelineKindInFilter(kind: TimelineKind, filter: TimelineFilter) {
  if (filter === "all") return true;

  if (filter === "cadence") {
    return (
      kind === "cadence_started" ||
      kind === "cadence_restarted" ||
      kind === "cadence_stopped" ||
      kind === "cadence_repaired"
    );
  }

  if (filter === "tasks") {
    return kind === "task_open" || kind === "task_completed";
  }

  if (filter === "activity") {
    return kind === "activity" || kind === "contact_updated";
  }

  if (filter === "status") {
    return kind === "status_changed";
  }

  if (filter === "assignment") {
    return kind === "assignment_changed";
  }

  return true;
}

function shouldCollapseBody(body: string | null | undefined) {
  if (!body) return false;
  return body.length > 220 || body.split("\n").length > 4;
}

function truncatedBody(body: string) {
  if (body.length <= 220) return body;
  return `${body.slice(0, 220).trimEnd()}…`;
}

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const contactId = params?.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [contact, setContact] = useState<ContactWithOrg | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [expandedTimelineBodies, setExpandedTimelineBodies] = useState<
    Record<string, boolean>
  >({});

  const [selectedCadence, setSelectedCadence] = useState<string>("protos_prospecting_v1");
  const [statusDraft, setStatusDraft] = useState<string>("New");

  const [reps, setReps] = useState<RepRow[]>([]);
  const [cadences, setCadences] = useState<CadenceRow[]>([]);
  const [assignedDraft, setAssignedDraft] = useState<string>("");
  const [canAssignEdit, setCanAssignEdit] = useState(false);
  const [myRole, setMyRole] = useState<"admin" | "manager" | "rep" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [taskNotes, setTaskNotes] = useState("");

  const [activityType, setActivityType] = useState("note");
  const [activitySubject, setActivitySubject] = useState("");
  const [activityBody, setActivityBody] = useState("");
  const [activityOutcome, setActivityOutcome] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState("");

  const [priorityDetail, setPriorityDetail] = useState<ContactPriorityDetail | null>(null);
  const [accountIntelligence, setAccountIntelligence] =
    useState<AccountIntelligenceResponse | null>(null);
  const [accountIntelligenceLoading, setAccountIntelligenceLoading] = useState(false);

  const subjectRef = useRef<HTMLInputElement | null>(null);
  const createTaskRef = useRef<HTMLDivElement | null>(null);
  const cadencePreviewRef = useRef<HTMLDivElement | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const [touchActivityId, setTouchActivityId] = useState<string | null>(null);
  const [touchStartedAt, setTouchStartedAt] = useState<string | null>(null);
  const [touchNow, setTouchNow] = useState<number>(Date.now());

  const [cadencePreview, setCadencePreview] = useState<CadencePreview | null>(null);
  const [cadenceLoading, setCadenceLoading] = useState(false);
  const [showCadencePreviewPulse, setShowCadencePreviewPulse] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editBuyingCommitteeRoleOverride, setEditBuyingCommitteeRoleOverride] =
    useState("");
  const [editSport, setEditSport] = useState("");
  const [editDivision, setEditDivision] = useState("");
  const [editConference, setEditConference] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editStatus, setEditStatus] = useState("New");
  const [editRepNotes, setEditRepNotes] = useState("");
  const [editAssignedToUserId, setEditAssignedToUserId] = useState("");
  const [editActive, setEditActive] = useState(true);

  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState<SchoolRow[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRow | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!showCadencePreviewPulse) return;
    const t = setTimeout(() => setShowCadencePreviewPulse(false), 2200);
    return () => clearTimeout(t);
  }, [showCadencePreviewPulse]);

  useEffect(() => {
    if (!touchActivityId || !touchStartedAt) return;
    const i = setInterval(() => setTouchNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [touchActivityId, touchStartedAt]);

  const displayName = useMemo(() => {
    if (!contact) return "";
    const fn = contact.first_name?.trim() || "";
    const ln = contact.last_name?.trim() || "";
    const base = `${fn} ${ln}`.trim() || "(No name)";
    const org =
      contact.vertical === "corporate"
        ? contact.accounts?.name
        : contact.schools?.name;

    return org ? `${base} • ${org}` : base;
  }, [contact]);

  const repLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const rep of reps) {
      map.set(rep.user_id, rep.full_name || rep.email || rep.user_id);
    }
    return map;
  }, [reps]);

  const orgLabel = useMemo(() => {
    if (!contact) return "Organization";
    return contact.vertical === "corporate" ? "Account" : "School";
  }, [contact]);

  const orgName = useMemo(() => {
    if (!contact) return "—";
    return contact.vertical === "corporate"
      ? contact.accounts?.name || "—"
      : contact.schools?.name || "—";
  }, [contact]);

  const orgSearchPlaceholder = useMemo(() => {
    if (!contact) return "Search organization name...";
    return contact.vertical === "corporate"
      ? "Search account name..."
      : "Search school name...";
  }, [contact]);

  const orgCreateLabel = useMemo(() => {
    if (!contact) return "organization";
    return contact.vertical === "corporate" ? "account" : "school";
  }, [contact]);

  const focusLabel = useMemo(() => {
    if (!contact) return "Focus";
    return contact.vertical === "corporate" ? "Industry" : "Sport";
  }, [contact]);

  const divisionLabel = useMemo(() => {
    if (!contact) return "Segment";
    return contact.vertical === "corporate" ? "Function" : "Division";
  }, [contact]);

  const conferenceLabel = useMemo(() => {
    if (!contact) return "Segment";
    return contact.vertical === "corporate" ? "Department" : "Conference";
  }, [contact]);

  const regionLabel = useMemo(() => "Region", []);

  const availableCadences = useMemo(() => {
    if (!contact) return [];
    return cadences.filter(
      (cadence) =>
        cadence.is_active &&
        cadence.vertical === contact.vertical
    );
  }, [cadences, contact]);

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!el || !(el as any).tagName) return false;
      const tag = String((el as any).tagName).toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const map: Record<string, string> = {
        c: "call",
        e: "email",
        t: "text",
        m: "meeting",
        n: "note",
      };

      const next = map[key];
      if (!next) return;

      e.preventDefault();
      setActivityType(next);
      setToast(`Activity mode: ${next.toUpperCase()}`);
      setTimeout(() => subjectRef.current?.focus(), 0);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const q = schoolQuery.trim();

    if (!q) {
      setSchoolResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSchoolLoading(true);

      const endpoint =
        contact?.vertical === "corporate"
          ? `/api/accounts/search?q=${encodeURIComponent(q)}`
          : `/api/schools/search?q=${encodeURIComponent(q)}`;

      const res = await fetchWithAuth(endpoint);
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setSchoolResults((json.data ?? []) as SchoolRow[]);
      } else {
        setSchoolResults([]);
      }

      setSchoolLoading(false);
    }, 250);

    return () => clearTimeout(t);
  }, [schoolQuery, contact?.vertical]);

  function hydrateEditForm(c: ContactWithOrg | null) {
    if (!c) return;

    setEditFirstName(c.first_name ?? "");
    setEditLastName(c.last_name ?? "");
    setEditEmail(c.primary_email ?? "");
    setEditPhone(c.phone ?? "");
    setEditJobTitle(c.job_title_raw ?? "");
    setEditBuyingCommitteeRoleOverride(c.buying_committee_role_override ?? "");
    setEditSport(c.sport ?? "");
    setEditDivision(c.division ?? "");
    setEditConference(c.conference ?? "");
    setEditRegion(c.region ?? "");
    setEditStatus(c.status ?? "New");
    setEditRepNotes(c.rep_notes ?? "");
    setEditAssignedToUserId(c.assigned_to_user_id ?? "");
    setEditActive(Boolean(c.active));

    if (c.vertical === "corporate") {
      setSelectedSchool(
        c.account_id && c.accounts?.name
          ? {
              id: c.account_id,
              name: c.accounts.name,
              tier: null,
            }
          : null
      );
    } else {
      setSelectedSchool(
        c.school_id && c.schools?.name
          ? {
              id: c.school_id,
              name: c.schools.name,
              tier: priorityDetail?.school_tier ?? null,
            }
          : null
      );
    }

    setSchoolQuery("");
    setSchoolResults([]);
  }

  async function loadCadences() {
    const res = await fetchWithAuth("/api/cadence/list");
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setCadences([]);
      return;
    }

    setCadences((json.data ?? []) as CadenceRow[]);
  }

  async function loadTimeline() {
    if (!contactId) return;

    setTimelineLoading(true);

    const res = await fetchWithAuth(`/api/contacts/${contactId}/timeline`);
    const json = (await res.json().catch(() => ({}))) as Partial<TimelineResponse> & {
      error?: string;
    };

    if (!res.ok) {
      setTimelineItems([]);
      setTimelineLoading(false);
      return;
    }

    setTimelineItems((json.items ?? []) as TimelineItem[]);
    setTimelineLoading(false);
  }

  async function loadAccountIntelligence(accountId: string | null) {
    if (!accountId) {
      setAccountIntelligence(null);
      return null;
    }

    setAccountIntelligenceLoading(true);

    const res = await fetchWithAuth(`/api/accounts/${accountId}/intelligence`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setAccountIntelligence(null);
      setAccountIntelligenceLoading(false);
      return null;
    }

    setAccountIntelligence(json as AccountIntelligenceResponse);
    setAccountIntelligenceLoading(false);
    return json as AccountIntelligenceResponse;
  }

  async function loadAll() {
    if (!contactId) return;

    setLoading(true);
    setErr(null);

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) {
      router.replace("/login");
      return;
    }

    setCurrentUserId(userId);

    const meRes = await fetchWithAuth("/api/auth/me");
    const meJson = await meRes.json().catch(() => ({}));

    const resolvedRole = (meRes.ok ? meJson.role : "rep") as "admin" | "manager" | "rep";
    setMyRole(resolvedRole);

    await loadCadences();

    if (resolvedRole === "admin" || resolvedRole === "manager") {
      const repsRes = await fetchWithAuth("/api/reps/list");
      const repsJson = await repsRes.json().catch(() => ({}));
      if (repsRes.ok) {
        setReps((repsJson.data ?? []) as RepRow[]);
        setCanAssignEdit(true);
      } else {
        setReps([]);
        setCanAssignEdit(false);
      }
    } else {
      setReps([]);
      setCanAssignEdit(false);
    }

    const { data: cData, error: cErr } = await supabase
      .from("contacts")
      .select(`
        id,
        school_id,
        account_id,
        buying_committee_role_override,
        vertical,
        sport,
        division,
        conference,
        region,
        first_name,
        last_name,
        job_title_raw,
        primary_email,
        phone,
        active,
        owner_user_id,
        assigned_to_user_id,
        status,
        rep_notes,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at,
        cadence_started_at,
        cadence_updated_at,
        last_activity_at,
        last_activity_type,
        last_activity_subject,
        created_at,
        updated_at,
        schools(name),
        accounts!contacts_account_id_fkey(name)
      `)
      .eq("id", contactId)
      .maybeSingle();

    if (cErr) {
      setErr(cErr.message);
      setContact(null);
      setLoading(false);
      return;
    }

    if (!cData) {
      setErr("Contact not found (or blocked by RLS).");
      setContact(null);
      setLoading(false);
      return;
    }

    const c = cData as unknown as ContactWithOrg;
    setContact(c);

    if (c.vertical === "corporate" && c.account_id) {
      await loadAccountIntelligence(c.account_id);
    } else {
      setAccountIntelligence(null);
    }

    setStatusDraft(c.status || "New");
    setSelectedCadence(c.cadence_key || "protos_prospecting_v1");
    setAssignedDraft(c.assigned_to_user_id || "");
    hydrateEditForm(c);

    const { data: tData, error: tErr } = await supabase
      .from("tasks")
      .select(`
        id,
        contact_id,
        assigned_to_user_id,
        owner_user_id,
        title,
        task_type,
        due_at,
        completed_at,
        notes,
        status,
        kind,
        cadence_key,
        cadence_step,
        created_at
      `)
      .eq("contact_id", contactId)
      .order("due_at", { ascending: true });

    const { data: aData, error: aErr } = await supabase
      .from("activities")
      .select(`
        id,
        contact_id,
        user_id,
        type,
        occurred_at,
        subject,
        body,
        outcome,
        started_at,
        ended_at,
        duration_seconds,
        created_at
      `)
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false });

    const priorityRes = await fetchWithAuth(`/api/contacts/priority?contact_id=${contactId}`);
    const priorityJson = await priorityRes.json().catch(() => ({}));
    if (priorityRes.ok) {
      setPriorityDetail((priorityJson.data ?? null) as ContactPriorityDetail | null);
    } else {
      setPriorityDetail(null);
    }

    await loadTimeline();

    if (tErr) setErr((prev) => prev || tErr.message);
    if (aErr) setErr((prev) => prev || aErr.message);

    setTasks((tData as Task[]) || []);
    setActivities((aData as Activity[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  useEffect(() => {
    if (!contact) return;

    const cadenceIsActive =
      contact.cadence_status === "active" &&
      !!contact.cadence_key &&
      Number(contact.cadence_step || 0) > 0;

    if (!cadenceIsActive) {
      setCadencePreview(null);
      return;
    }

    void loadCadencePreview(contact.cadence_key || selectedCadence, contact.cadence_step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, contact?.cadence_key, contact?.cadence_step, contact?.cadence_status]);

  async function refreshAll() {
    if (!contactId) return null;

    const { data: cData } = await supabase
      .from("contacts")
      .select(`
        id,
        school_id,
        account_id,
        buying_committee_role_override,
        vertical,
        sport,
        division,
        conference,
        region,
        first_name,
        last_name,
        job_title_raw,
        primary_email,
        phone,
        active,
        owner_user_id,
        assigned_to_user_id,
        status,
        rep_notes,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at,
        cadence_started_at,
        cadence_updated_at,
        last_activity_at,
        last_activity_type,
        last_activity_subject,
        created_at,
        updated_at,
        schools(name),
        accounts!contacts_account_id_fkey(name)
      `)
      .eq("id", contactId)
      .maybeSingle();

    const { data: tData } = await supabase
      .from("tasks")
      .select(`
        id,
        contact_id,
        assigned_to_user_id,
        owner_user_id,
        title,
        task_type,
        due_at,
        completed_at,
        notes,
        status,
        kind,
        cadence_key,
        cadence_step,
        created_at
      `)
      .eq("contact_id", contactId)
      .order("due_at", { ascending: true });

    const { data: aData } = await supabase
      .from("activities")
      .select(`
        id,
        contact_id,
        user_id,
        type,
        occurred_at,
        subject,
        body,
        outcome,
        started_at,
        ended_at,
        duration_seconds,
        created_at
      `)
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false });

    const priorityRes = await fetchWithAuth(`/api/contacts/priority?contact_id=${contactId}`);
    const priorityJson = await priorityRes.json().catch(() => ({}));
    if (priorityRes.ok) {
      setPriorityDetail((priorityJson.data ?? null) as ContactPriorityDetail | null);
    } else {
      setPriorityDetail(null);
    }

    await loadTimeline();

    const freshContact = (cData as unknown as ContactWithOrg | null) ?? null;

    setContact(freshContact);

    if (freshContact?.vertical === "corporate" && freshContact.account_id) {
      await loadAccountIntelligence(freshContact.account_id);
    } else {
      setAccountIntelligence(null);
    }

    setTasks((tData as Task[]) || []);
    setActivities((aData as Activity[]) || []);

    if (freshContact) {
      setAssignedDraft(freshContact.assigned_to_user_id || "");
      hydrateEditForm(freshContact);
    }

    return freshContact;
  }

  async function loadCadencePreview(
    cadenceKeyOverride?: string,
    stepOverride?: number
  ) {
    if (!contactId) return null;

    setCadenceLoading(true);
    setErr(null);

    const cadenceKey =
      cadenceKeyOverride || selectedCadence || contact?.cadence_key || "";

    const step =
      stepOverride ??
      (contact?.cadence_status === "active" && (contact?.cadence_step ?? 0) > 0
        ? contact.cadence_step
        : 1);

    const params = new URLSearchParams();
    params.set("contact_id", contactId);
    if (cadenceKey) params.set("cadence_key", cadenceKey);
    if (step && step > 0) params.set("step", String(step));

    const res = await fetchWithAuth(`/api/cadence/render-step?${params.toString()}`);
    const json = await res.json().catch(() => ({}));

    setCadenceLoading(false);

    if (!res.ok) {
      setCadencePreview(null);
      setErr(json?.error ?? "Failed to load cadence step");
      return null;
    }

    const preview = json as CadencePreview;
    setCadencePreview(preview);
    return preview;
  }

  async function saveStatus() {
    if (!contactId) return;
    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/set-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, status: statusDraft }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(
        [json?.error, json?.details, json?.hint].filter(Boolean).join(" • ") ||
          "Failed to update status"
      );
      setBusy(false);
      return;
    }

    await refreshAll();
    setBusy(false);
    setToast("Status updated");
  }

  async function saveAssignment() {
    if (!contactId) return;

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        assigned_to_user_id: assignedDraft || null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to assign contact");
      setBusy(false);
      return;
    }

    await refreshAll();
    setBusy(false);
    setToast("Assignment updated");
  }

  async function claimContact() {
    if (!contactId) return;

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to claim contact");
      setBusy(false);
      return;
    }

    await refreshAll();
    setBusy(false);
    setToast("Contact claimed");
  }

  async function createSchoolFromQuery() {
    const rawName = schoolQuery.trim();
    if (!rawName) return;

    setEditBusy(true);
    setErr(null);

    const endpoint =
      contact?.vertical === "corporate" ? "/api/accounts/create" : "/api/schools/create";

    const res = await fetchWithAuth(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: rawName,
        tier: null,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(
        json?.error ??
          `Failed to create ${contact?.vertical === "corporate" ? "account" : "school"}`
      );
      setEditBusy(false);
      return;
    }

    if (json?.account) {
      setSelectedSchool(json.account as SchoolRow);
      setSchoolQuery("");
      setSchoolResults([]);
      setToast(json?.created ? "Account created" : "Existing account selected");
    } else if (json?.school) {
      setSelectedSchool(json.school as SchoolRow);
      setSchoolQuery("");
      setSchoolResults([]);
      setToast(json?.created ? "School created" : "Existing school selected");
    }

    setEditBusy(false);
  }

  async function saveContactEdits() {
    if (!contact?.id) return;

    setEditBusy(true);
    setErr(null);

    const payload: Record<string, unknown> = {
      contact_id: contact.id,
      vertical: contact.vertical,
      first_name: editFirstName,
      last_name: editLastName,
      primary_email: editEmail,
      phone: editPhone,
      job_title_raw: editJobTitle,
      sport: editSport,
      division: editDivision,
      conference: editConference,
      region: editRegion,
      status: editStatus,
      rep_notes: editRepNotes,
      buying_committee_role_override:
        contact.vertical === "corporate"
          ? editBuyingCommitteeRoleOverride || null
          : null,
      ...(contact.vertical === "corporate"
        ? { account_id: selectedSchool?.id ?? null, school_id: null }
        : { school_id: selectedSchool?.id ?? null, account_id: null }),
      ...(canAssignEdit && canSeeAssignmentFieldsInEdit
        ? {
            assigned_to_user_id: editAssignedToUserId || null,
            active: editActive,
          }
        : {}),
    };

    const res = await fetchWithAuth("/api/contacts/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to update contact");
      setEditBusy(false);
      return;
    }

    await refreshAll();
    setEditBusy(false);
    setEditOpen(false);
    setToast("Contact updated");
  }

  function cancelContactEdits() {
    hydrateEditForm(contact);
    setEditOpen(false);
  }

  async function startCadence(force_restart: boolean) {
    if (!contactId) return;
    if (!selectedCadence) {
      setErr("Select a cadence first.");
      return;
    }

    if (
      !force_restart &&
      contact?.cadence_status === "active" &&
      contact?.cadence_key === selectedCadence &&
      (contact?.cadence_step ?? 0) > 0
    ) {
      setToast(`Cadence already active — step ${contact.cadence_step}`);
      return;
    }

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/cadence/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        cadence_key: selectedCadence,
        force_restart,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to start cadence");
      setBusy(false);
      return;
    }

    const freshContact = await refreshAll();

    const stepToPreview =
      freshContact?.cadence_status === "active" && (freshContact?.cadence_step ?? 0) > 0
        ? freshContact.cadence_step
        : 1;

    const preview = await loadCadencePreview(selectedCadence, stepToPreview);

    if (preview) {
      setToast(`Cadence started — Step ${preview.step} ready`);
      setShowCadencePreviewPulse(true);
      setTimeout(() => {
        cadencePreviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    } else {
      setToast("Cadence started");
    }

    setBusy(false);
  }

  async function restartCadence() {
    await startCadence(true);
  }

  async function stopCadence() {
    if (!contactId) return;
    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/cadence/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, reason: "manual_stop" }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to stop cadence");
      setBusy(false);
      return;
    }

    await refreshAll();
    setCadencePreview(null);
    setBusy(false);
    setToast("Cadence stopped");
  }

  async function createManualTask() {
    setErr(null);

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId || !contactId) return;

    const dueAt = new Date(taskDue + "T17:00:00").toISOString();

    const { error } = await supabase.from("tasks").insert({
      contact_id: contactId,
      assigned_to_user_id: userId,
      owner_user_id: userId,
      kind: "manual",
      task_type: "follow_up",
      title: taskTitle.trim() || null,
      notes: taskNotes.trim() || null,
      due_at: dueAt,
      status: "open",
      cadence_key: null,
      cadence_step: null,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    setTaskTitle("");
    setTaskNotes("");
    await refreshAll();
    setToast("Task created");
  }

  function createFollowUpTask() {
    setTaskTitle("Follow up");
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setTaskDue(d.toISOString().slice(0, 10));
    setToast("Follow-up task prefilled");
    setTimeout(() => {
      createTaskRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function applyOutcome(outcome: string) {
    if (!contactId) return;

    if (outcome === "booked_demo" || outcome === "replied") {
      await supabase
        .from("contacts")
        .update({
          status: "Secured/Active",
          cadence_status: "stopped",
          cadence_next_due_at: null,
          cadence_updated_at: new Date().toISOString(),
        })
        .eq("id", contactId);

      if (outcome === "booked_demo") {
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user?.id;
        if (userId) {
          const dueAt = new Date();
          dueAt.setDate(dueAt.getDate() + 1);

          await supabase.from("tasks").insert({
            contact_id: contactId,
            assigned_to_user_id: userId,
            owner_user_id: userId,
            kind: "manual",
            task_type: "follow_up",
            title: "Demo follow-up",
            notes: "Booked demo outcome selected. Confirm meeting details and next steps.",
            due_at: dueAt.toISOString(),
            status: "open",
            cadence_key: null,
            cadence_step: null,
          });
        }
      }
    }

    if (outcome === "wrong_contact" || outcome === "do_not_contact") {
      await supabase
        .from("contacts")
        .update({
          status: "Closed/Do Not Contact",
          cadence_status: "stopped",
          cadence_next_due_at: null,
          cadence_updated_at: new Date().toISOString(),
        })
        .eq("id", contactId);
    }

    await refreshAll();
  }

  async function logActivityViaApi(
    typeOverride?: string,
    subjectOverride?: string,
    bodyOverride?: string
  ) {
    setErr(null);
    if (!contactId) return;

    const outcomeToSend = selectedOutcome || activityOutcome;

    const res = await fetchWithAuth("/api/activities/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        type: typeOverride ?? activityType,
        subject: subjectOverride ?? activitySubject,
        body: bodyOverride ?? activityBody,
        outcome: outcomeToSend,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to log activity");
      return;
    }

    if (!typeOverride) {
      setActivitySubject("");
      setActivityBody("");
      setActivityOutcome("");
    }

    if (selectedOutcome) {
      await applyOutcome(selectedOutcome);
      setSelectedOutcome("");
    } else {
      await refreshAll();
    }

    setToast(`${(typeOverride ?? activityType).toUpperCase()} saved`);
  }

  async function startTouch() {
    setErr(null);
    if (!contactId) return;
    if (touchActivityId) return;

    const res = await fetchWithAuth("/api/activities/touch-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? `Touch blocked (${json?.reason ?? "unknown"})`);
      return;
    }

    if (json?.blocked) {
      setErr(`Touch blocked: ${json.reason}`);
      return;
    }

    const a = json.activity as Activity;
    setTouchActivityId(a.id);
    setTouchStartedAt(a.started_at || a.occurred_at);
    setToast("Touch started");
    await refreshAll();
  }

  async function stopTouch() {
    setErr(null);
    if (!touchActivityId) return;

    const res = await fetchWithAuth("/api/activities/touch-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_id: touchActivityId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json?.error ?? "Failed to stop touch");
      return;
    }

    setTouchActivityId(null);
    setTouchStartedAt(null);
    setToast("Touch completed");
    await refreshAll();
  }

  function cleanEmailText(text: string) {
    return (text || "")
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function mailto(to: string, subject: string, body: string) {
    const cleanSubject = cleanEmailText(subject);
    const cleanBody = cleanEmailText(body);

    const url =
      `mailto:${encodeURIComponent(to)}` +
      `?subject=${encodeURIComponent(cleanSubject)}` +
      `&body=${encodeURIComponent(cleanBody)}`;

    window.location.href = url;
  }

  async function repairCadence() {
    if (!contact?.id) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;

      const res = await fetch(`/api/cadence/repair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contact_id: contact.id,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErr(json.error || "Cadence repair failed");
        return;
      }

      await refreshAll();
      setToast("Cadence repaired");
    } catch (e: any) {
      setErr(e?.message || "Cadence repair failed");
    }
  }

  async function sendEmailAndLog() {
    setErr(null);

    if (!contact?.primary_email) {
      setErr("No primary email on this contact.");
      return;
    }

    let preview = cadencePreview;
    if (!preview) {
      preview = await loadCadencePreview(
        selectedCadence,
        contact?.cadence_step && contact.cadence_step > 0 ? contact.cadence_step : 1
      );
    }

    if (!preview) return;

    if (
      (preview.required_contact_status || "").toLowerCase() === "new" &&
      preview.contact_status.toLowerCase() !== "new"
    ) {
      setErr(`Cadence is blocked because contact status is ${preview.contact_status}.`);
      return;
    }

    if (
      contact?.cadence_status === "active" &&
      (contact?.cadence_step ?? 0) > 0 &&
      preview.step !== contact.cadence_step
    ) {
      setErr(
        `Cadence step mismatch. Contact is on step ${contact.cadence_step}, but preview is showing step ${preview.step}. Refresh preview and try again.`
      );
      return;
    }

    mailto(contact.primary_email, preview.subject, preview.body);

    const emailRes = await fetchWithAuth("/api/activities/email-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contact.id,
        subject: `Cadence Email Step ${preview.step}: ${preview.subject}`,
        body: preview.body,
      }),
    });

    const emailJson = await emailRes.json().catch(() => ({}));

    if (!emailRes.ok) {
      setErr(
        ["Email logging failed.", emailJson?.error, emailJson?.context]
          .filter(Boolean)
          .join(" ")
      );
      await refreshAll();
      return;
    }

    const freshContact = await refreshAll();

    const nextStep =
      freshContact?.cadence_status === "active" && (freshContact?.cadence_step ?? 0) > 0
        ? freshContact.cadence_step
        : preview.step + 1;

    const nextPreview = await loadCadencePreview(selectedCadence, nextStep);

    if (nextPreview) {
      setShowCadencePreviewPulse(true);
      setTimeout(() => {
        cadencePreviewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);

      setToast(`Email logged — Step ${nextPreview.step} ready`);
    } else {
      setToast("Email logged");
    }
  }

  const nextBestAction = useMemo(() => {
    if (!contact) return null;

    const status = (contact.status || "").toLowerCase();
    const cadenceStatus = (contact.cadence_status || "").toLowerCase();
    const cadenceDue = contact.cadence_next_due_at ? new Date(contact.cadence_next_due_at) : null;
    const cadenceIsDue = cadenceDue ? cadenceDue.getTime() <= Date.now() : false;
    const lastTouchDays = daysSince(contact.last_activity_at);

    if (status !== "new") {
      return {
        mode: "blocked",
        headline: "Cadence is blocked (status not New)",
        bullets: [
          "If they booked a demo or became active, keep status as-is and focus on follow-ups.",
          "Set status back to New only if you intentionally want cadence to resume.",
        ],
        tone: "warn",
      };
    }

    if (cadenceStatus === "completed") {
      return {
        mode: "completed",
        headline: "Cadence completed",
        bullets: [
          "The outreach sequence is finished.",
          "Continue manual follow-up or restart the cadence if appropriate.",
        ],
        tone: "neutral",
      };
    }

    if (cadenceStatus !== "active") {
      return {
        mode: "inactive",
        headline: "Cadence not started — begin step 1",
        bullets: [
          "Start the outreach cadence.",
          "Then send the first email from the preview panel.",
          "Use follow-up tasks or call logging if you want to work manually instead.",
        ],
        tone: "neutral",
      };
    }

    if (lastTouchDays !== null && lastTouchDays >= 14) {
      return {
        mode: "stale-active",
        headline: `Cadence step ${contact.cadence_step} is due — execute`,
        bullets: [
          "Send the cadence email now.",
          "Log EMAIL immediately so the record stays clean.",
          "If they reply or book, change status to Secured/Active.",
        ],
        tone: "good",
      };
    }

    if (cadenceIsDue) {
      return {
        mode: "active",
        headline: `Cadence step ${contact.cadence_step} is due — execute`,
        bullets: [
          "Send the cadence email.",
          "Log EMAIL immediately so the record stays clean.",
          "If they reply or book, change status to Secured/Active.",
        ],
        tone: "good",
      };
    }

    return {
      mode: "neutral",
      headline: "Keep momentum — one meaningful touch",
      bullets: [
        "Start Touch Timer before you call/email.",
        "Log the activity with a clear outcome.",
        "Update status when they progress.",
      ],
      tone: "neutral",
    };
  }, [contact]);

  const touchElapsedSeconds = useMemo(() => {
    if (!touchActivityId || !touchStartedAt) return null;
    const started = new Date(touchStartedAt).getTime();
    return Math.max(0, Math.round((touchNow - started) / 1000));
  }, [touchActivityId, touchStartedAt, touchNow]);

  const showSchoolResults = schoolQuery.trim().length > 0 && !selectedSchool;
  const normalizedSchoolQuery = useMemo(() => normalizeSchoolText(schoolQuery), [schoolQuery]);

  const exactSchoolMatch = useMemo(() => {
    if (!normalizedSchoolQuery) return null;

    return (
      schoolResults.find(
        (school) => normalizeSchoolText(school.name) === normalizedSchoolQuery
      ) ?? null
    );
  }, [schoolResults, normalizedSchoolQuery]);

  const cadenceBlocked = contact?.status !== "New";
  const isPrivilegedUser = myRole === "admin" || myRole === "manager";
  const isAssignedToMe = !!currentUserId && contact?.assigned_to_user_id === currentUserId;
  const isOwner = !!currentUserId && contact?.owner_user_id === currentUserId;
  const canWorkOwnedContact = !!contact && (isPrivilegedUser || isAssignedToMe || isOwner);

  const canSeeAssignmentFieldsInEdit = isPrivilegedUser;
  const canUseAssignmentControls = isPrivilegedUser && canAssignEdit;

  const canEditContactUi = canWorkOwnedContact;
  const canSaveStatusUi = canWorkOwnedContact;
  const canClaimContactUi = !!currentUserId && !contact?.assigned_to_user_id;
  const canManageCadenceUi = canWorkOwnedContact;
  const canCreateTaskUi = canWorkOwnedContact;
  const canLogActivityUi = canWorkOwnedContact;
  const canUseTouchTimerUi = canWorkOwnedContact;
  const canRepairCadenceUi = isPrivilegedUser;

  const operationalSummary = useMemo(() => {
    if (!contact) return "";

    const nextDue = contact.cadence_next_due_at
      ? new Date(contact.cadence_next_due_at).toLocaleString()
      : "No due date";

    const lastTouch = contact.last_activity_at
      ? new Date(contact.last_activity_at).toLocaleString()
      : "None";

    if (!canWorkOwnedContact && canClaimContactUi) {
      return "Claim this contact to unlock execution controls.";
    }

    if (!canWorkOwnedContact) {
      return "This contact is assigned elsewhere. Open the record to review, but execution controls are limited.";
    }

    if (contact.status !== "New") {
      return `Status is ${contact.status}. Cadence is blocked until status returns to New.`;
    }

    if (contact.cadence_status === "active") {
      return `Cadence ${contact.cadence_key || "—"} is active on step ${contact.cadence_step}. Next due: ${nextDue}. Last touch: ${lastTouch}.`;
    }

    if (contact.cadence_status === "completed") {
      return `Cadence completed. Last touch: ${lastTouch}. Manual follow-up or restart may be appropriate.`;
    }

    return `Cadence is not active. Last touch: ${lastTouch}.`;
  }, [canClaimContactUi, canWorkOwnedContact, contact]);

  const timelineCounts = useMemo(() => {
    return {
      all: timelineItems.length,
      cadence: timelineItems.filter((i) => isTimelineKindInFilter(i.kind, "cadence")).length,
      tasks: timelineItems.filter((i) => isTimelineKindInFilter(i.kind, "tasks")).length,
      activity: timelineItems.filter((i) => isTimelineKindInFilter(i.kind, "activity")).length,
      status: timelineItems.filter((i) => isTimelineKindInFilter(i.kind, "status")).length,
      assignment: timelineItems.filter((i) =>
        isTimelineKindInFilter(i.kind, "assignment")
      ).length,
    };
  }, [timelineItems]);

  const filteredTimelineItems = useMemo(() => {
    return timelineItems.filter((item) => isTimelineKindInFilter(item.kind, timelineFilter));
  }, [timelineItems, timelineFilter]);

  const groupedTimeline = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};

    for (const item of filteredTimelineItems) {
      const key = new Date(item.ts).toLocaleDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return Object.entries(groups);
  }, [filteredTimelineItems]);

  if (loading) {
    return <div className="text-muted-foreground">Loading contact…</div>;
  }

  if (err && !contact) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => router.push("/contacts")}
        >
          Back to Contacts
        </button>
      </div>
    );
  }

  if (!contact) {
    return <div className="text-muted-foreground">Contact not found.</div>;
  }

  const currentAssignedLabel = contact.assigned_to_user_id
    ? repLabelById.get(contact.assigned_to_user_id) || contact.assigned_to_user_id
    : "Unassigned";

  const accessMessage = isPrivilegedUser
    ? null
    : contact.assigned_to_user_id
      ? "You can fully work contacts assigned to you or owned by you."
      : "This contact is currently unassigned. Claim it to work and update it.";

  return (
    <div className="space-y-8">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border bg-white px-4 py-3 shadow">
          <div className="text-sm font-semibold">{toast}</div>
          <div className="mt-1 text-xs text-muted-foreground">Shortcuts: c/e/t/m/n</div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">{displayName}</div>

          <div className="mt-2">
            <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize">
              {contact.vertical}
            </span>
          </div>

          <div className="mt-1 text-sm text-muted-foreground">
            {contact.job_title_raw || ""}
            {contact.primary_email ? ` • ${contact.primary_email}` : ""}
            {contact.phone ? ` • ${contact.phone}` : ""}
          </div>

          <div className="mt-2 text-sm text-muted-foreground">
            {focusLabel}: {contact.sport}
            {contact.division ? ` • ${contact.division}` : ""}
            {contact.conference ? ` • ${contact.conference}` : ""}
            {contact.region ? ` • ${contact.region}` : ""}
          </div>
        </div>

        <div className="flex gap-2">
          {canClaimContactUi ? (
            <button
              className="rounded-xl border px-4 py-2"
              disabled={busy}
              onClick={claimContact}
            >
              Claim
            </button>
          ) : null}

          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => router.push("/contacts")}
          >
            Back
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      {!canEditContactUi && accessMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {accessMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Operational Controls</div>
              <div className="mt-1 text-sm text-muted-foreground">{operationalSummary}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canManageCadenceUi ? (
                <select
                  className="min-w-[260px] rounded-xl border px-3 py-2 text-sm"
                  value={selectedCadence}
                  onChange={(e) => setSelectedCadence(e.target.value)}
                >
                  <option value="">Select cadence...</option>
                  {availableCadences.map((cadence) => (
                    <option key={cadence.key} value={cadence.key}>
                      {cadence.name || cadence.key}
                    </option>
                  ))}
                </select>
              ) : null}

              {canClaimContactUi ? (
                <button
                  className="rounded-xl border px-4 py-2"
                  disabled={busy}
                  onClick={claimContact}
                >
                  Claim contact
                </button>
              ) : null}

              {contact.cadence_status !== "active" ? (
                <button
                  className="rounded-xl border px-4 py-2"
                  disabled={
                    busy ||
                    cadenceBlocked ||
                    !canManageCadenceUi ||
                    !selectedCadence
                  }
                  onClick={() => startCadence(false)}
                >
                  Start cadence
                </button>
              ) : (
                <button
                  className="rounded-xl border px-4 py-2"
                  disabled={
                    busy ||
                    cadenceBlocked ||
                    !canManageCadenceUi ||
                    !selectedCadence
                  }
                  onClick={restartCadence}
                >
                  Restart cadence
                </button>
              )}

              <button
                className="rounded-xl border px-4 py-2"
                disabled={busy || !canManageCadenceUi}
                onClick={stopCadence}
              >
                Stop cadence
              </button>

              <button
                className="rounded-xl border px-4 py-2"
                disabled={!canManageCadenceUi || !selectedCadence}
                onClick={async () => {
                  const stepToOpen =
                    contact.cadence_status === "active" && (contact.cadence_step ?? 0) > 0
                      ? contact.cadence_step
                      : 1;

                  await loadCadencePreview(selectedCadence, stepToOpen);

                  setShowCadencePreviewPulse(true);
                  setTimeout(() => {
                    cadencePreviewRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 0);
                }}
              >
                Open cadence step
              </button>

              {canRepairCadenceUi ? (
                <button
                  className="rounded-xl border px-4 py-2"
                  disabled={busy}
                  onClick={repairCadence}
                >
                  Repair cadence
                </button>
              ) : null}
            </div>
          </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
                  contact.status
                )}`}
              >
                {contact.status}
              </span>

              {canSaveStatusUi ? (
                <>
                  <select
                    className="rounded-xl border px-3 py-2 text-sm"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-xl border px-3 py-2 text-sm"
                    disabled={busy}
                    onClick={saveStatus}
                  >
                    Save
                  </button>
                </>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Cadence only runs while status is <b>New</b>.
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Assignment</div>
            <div className="mt-2 text-sm font-semibold">{currentAssignedLabel}</div>
            {canUseAssignmentControls ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="min-w-[220px] rounded-xl border px-3 py-2 text-sm"
                  value={assignedDraft}
                  onChange={(e) => setAssignedDraft(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {reps
                    .filter((r) => r.is_active)
                    .map((r) => (
                      <option key={r.user_id} value={r.user_id}>
                        {r.full_name || r.email || r.user_id}
                      </option>
                    ))}
                </select>
                <button
                  className="rounded-xl border px-3 py-2 text-sm"
                  disabled={busy || !canUseAssignmentControls}
                  onClick={saveAssignment}
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                Assignment changes are manager/admin only.
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Cadence State</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${cadenceTone(
                  contact.cadence_status
                )}`}
              >
                {contact.cadence_status}
              </span>
              <span className="text-sm font-semibold">
                {contact.cadence_step > 0 ? `Step ${contact.cadence_step}` : "No active step"}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {contact.cadence_next_due_at
                ? `Next due: ${new Date(contact.cadence_next_due_at).toLocaleString()}`
                : "No cadence due date"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Active sequence: {contact.cadence_key || "none"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Selected sequence: {selectedCadence || "none"}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Next Best Action</div>
            <div className="mt-2 text-sm font-semibold">{nextBestAction?.headline}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {contact.last_activity_at
                ? `Last touch: ${new Date(contact.last_activity_at).toLocaleString()}`
                : "Last touch: none"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-xl border px-3 py-2 text-sm"
                onClick={() => {
                  setActivityType("call");
                  setToast("Activity mode: CALL");
                  setTimeout(() => subjectRef.current?.focus(), 0);
                }}
                disabled={!canLogActivityUi}
              >
                Log call
              </button>
              <button
                className="rounded-xl border px-3 py-2 text-sm"
                onClick={createFollowUpTask}
                disabled={!canCreateTaskUi}
              >
                Follow-up task
              </button>
            </div>
          </div>
        </div>

        {!canManageCadenceUi ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Claim or be assigned this contact to manage cadence execution.
          </div>
        ) : null}

        {cadenceBlocked ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Cadence is blocked because status is <b>{contact.status}</b>. Move the contact back to{" "}
            <b>New</b> to allow restart.
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">Edit Contact</div>
          <div className="flex gap-2">
            {!editOpen ? (
              canEditContactUi ? (
                <button
                  className="rounded-xl border px-4 py-2"
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </button>
              ) : null
            ) : (
              <>
                <button
                  className="rounded-xl border px-4 py-2"
                  disabled={editBusy}
                  onClick={saveContactEdits}
                >
                  {editBusy ? "Saving..." : "Save Changes"}
                </button>
                <button
                  className="rounded-xl border px-4 py-2"
                  disabled={editBusy}
                  onClick={cancelContactEdits}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {!editOpen ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{orgLabel}</div>
              <div className="mt-1 text-sm font-medium">{orgName}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="mt-1 text-sm font-medium">
                {`${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "—"}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="mt-1 text-sm font-medium">{contact.primary_email || "—"}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Assigned</div>
              <div className="mt-1 text-sm font-medium">{currentAssignedLabel}</div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">First Name</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Last Name</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Phone</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Job Title</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={editJobTitle}
                onChange={(e) => setEditJobTitle(e.target.value)}
              />
            </div>

            {contact.vertical === "corporate" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Buying Committee Role Override
                </label>
                <select
                  className="w-full rounded-xl border px-3 py-2"
                  value={editBuyingCommitteeRoleOverride}
                  onChange={(e) => setEditBuyingCommitteeRoleOverride(e.target.value)}
                >
                  <option value="">Use inferred role</option>
                  <option value="economic_buyer">Economic Buyer</option>
                  <option value="technical_buyer">Technical Buyer</option>
                  <option value="champion">Champion / Influencer</option>
                  <option value="operator">Operator / End User</option>
                  <option value="unknown">Unknown Role</option>
                </select>
                <div className="text-xs text-muted-foreground">
                  Leave blank to infer from job title automatically.
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{orgLabel}</label>

              {selectedSchool ? (
                <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium">{selectedSchool.name}</span>
                    {selectedSchool.tier ? ` • Tier ${selectedSchool.tier}` : ""}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-slate-600 hover:text-slate-900"
                    onClick={() => {
                      setSelectedSchool(null);
                      setSchoolQuery("");
                      setSchoolResults([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder={orgSearchPlaceholder}
                    value={schoolQuery}
                    onChange={(e) => setSchoolQuery(e.target.value)}
                  />

                  {showSchoolResults ? (
                    <div className="rounded-xl border bg-white">
                      {schoolLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Searching...
                        </div>
                      ) : (
                        <>
                          {schoolResults.length > 0 ? (
                            schoolResults.map((school) => (
                              <button
                                key={school.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSchool(school);
                                  setSchoolQuery("");
                                  setSchoolResults([]);
                                }}
                                className="block w-full border-b px-3 py-2 text-left hover:bg-slate-50"
                              >
                                <div className="text-sm font-medium">{school.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {school.tier ? `Tier ${school.tier}` : "No tier"}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="border-b px-3 py-2 text-sm text-muted-foreground">
                              No {orgCreateLabel}s found.
                            </div>
                          )}

                          {!exactSchoolMatch && schoolQuery.trim() ? (
                            <button
                              type="button"
                              disabled={editBusy}
                              onClick={createSchoolFromQuery}
                              className="block w-full px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                            >
                              Create {orgCreateLabel}:{" "}
                              <span className="font-semibold">{schoolQuery.trim()}</span>
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{focusLabel}</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editSport}
                  onChange={(e) => setEditSport(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{divisionLabel}</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editDivision}
                  onChange={(e) => setEditDivision(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{conferenceLabel}</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editConference}
                  onChange={(e) => setEditConference(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{regionLabel}</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={editRegion}
                  onChange={(e) => setEditRegion(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Status</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {canAssignEdit && canSeeAssignmentFieldsInEdit ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Assigned Rep</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2"
                    value={editAssignedToUserId}
                    onChange={(e) => setEditAssignedToUserId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {reps
                      .filter((r) => r.is_active)
                      .map((r) => (
                        <option key={r.user_id} value={r.user_id}>
                          {r.full_name || r.email || r.user_id}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Record State</label>
                  <label className="flex items-center gap-3 rounded-xl border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Rep Notes</label>
              <textarea
                className="min-h-[120px] w-full rounded-xl border px-3 py-2"
                value={editRepNotes}
                onChange={(e) => setEditRepNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-5">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Priority Engine</div>
          <div className="rounded-full border px-3 py-1 text-sm font-semibold">
            Score {priorityDetail?.score ?? 0}
          </div>
        </div>

        {!priorityDetail ? (
          <div className="mt-3 text-sm text-muted-foreground">Priority details unavailable.</div>
        ) : (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Why this is priority
            </summary>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Response Likelihood</div>
                <div className="mt-1 font-semibold">{priorityDetail.response_likelihood_score}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Cadence Score</div>
                <div className="mt-1 font-semibold">{priorityDetail.cadence_score}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Recency Score</div>
                <div className="mt-1 font-semibold">{priorityDetail.recency_score}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Program / Account Tier Score</div>
                <div className="mt-1 font-semibold">{priorityDetail.school_tier_score}</div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Conversion History Score</div>
                <div className="mt-1 font-semibold">
                  {priorityDetail.conversion_history_score}
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Context</div>

                {contact.vertical === "corporate" ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {priorityDetail.account_name
                      ? `Account: ${priorityDetail.account_name}`
                      : "Account: —"}
                    {priorityDetail.industry ? ` • Industry: ${priorityDetail.industry}` : ""}
                    {priorityDetail.company_size ? ` • Size: ${priorityDetail.company_size}` : ""}
                    {priorityDetail.cadence_status ? ` • Cadence: ${priorityDetail.cadence_status}` : ""}
                    {priorityDetail.cadence_step
                      ? ` • Step ${priorityDetail.cadence_step}`
                      : ""}
                    {priorityDetail.last_activity_at
                      ? ` • Last touch ${new Date(
                          priorityDetail.last_activity_at
                        ).toLocaleString()}`
                      : " • Never touched"}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    Tier {priorityDetail.school_tier} • {priorityDetail.cadence_status}
                    {priorityDetail.cadence_step > 0 ? ` • Step ${priorityDetail.cadence_step}` : ""}
                    {priorityDetail.last_activity_at
                      ? ` • Last touch ${new Date(priorityDetail.last_activity_at).toLocaleString()}`
                      : " • Never touched"}
                  </div>
                )}
              </div>
            </div>
          </details>
        )}
      </div>

      {contact.vertical === "corporate" ? (
        <AccountIntelligencePanel
          data={accountIntelligence}
          loading={accountIntelligenceLoading}
        />
      ) : (
        <div className="rounded-2xl border p-5">
          <div className="text-lg font-semibold">Organization Context</div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">School</div>
              <div className="mt-2 text-sm font-semibold">{contact.schools?.name || "—"}</div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Sport</div>
              <div className="mt-2 text-sm font-semibold">{contact.sport || "—"}</div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Region</div>
              <div className="mt-2 text-sm font-semibold">{contact.region || "—"}</div>
            </div>
          </div>
        </div>
      )}

      <div
        className={[
          "rounded-2xl border p-5",
          nextBestAction?.tone === "warn" ? "border-amber-200 bg-amber-50" : "",
          nextBestAction?.tone === "good" ? "border-green-200 bg-green-50" : "",
        ].join(" ")}
      >
        <div className="text-lg font-semibold">Next Best Action</div>

        <div className="mt-2 text-sm text-muted-foreground">
          Status: <span className="font-semibold">{contact.status}</span> • Cadence:{" "}
          <span className="font-semibold">{contact.cadence_status}</span>{" "}
          {contact.cadence_next_due_at
            ? `• Next due: ${new Date(contact.cadence_next_due_at).toLocaleString()}`
            : "• No cadence due date"}{" "}
          {contact.last_activity_at
            ? `• Last touch: ${new Date(contact.last_activity_at).toLocaleString()}`
            : "• Last touch: none"}
        </div>

        <div className="mt-4">
          <div className="text-xl font-semibold">{nextBestAction?.headline}</div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {(nextBestAction?.bullets || []).map((b, idx) => (
              <li key={idx}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {canClaimContactUi ? (
            <button
              className="rounded-xl border px-4 py-2"
              disabled={busy}
              onClick={claimContact}
            >
              Claim contact
            </button>
          ) : null}

          {!canWorkOwnedContact ? null : (
            <>
              {nextBestAction?.mode === "inactive" && (
                <>
                  <button
                    className="rounded-xl border bg-white px-4 py-2 hover:bg-gray-50"
                    disabled={busy || cadenceBlocked || !canManageCadenceUi}
                    onClick={() => startCadence(false)}
                  >
                    Start cadence
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={() => {
                      setActivityType("call");
                      setToast("Activity mode: CALL");
                      setTimeout(() => subjectRef.current?.focus(), 0);
                    }}
                    title="Shortcut: c"
                  >
                    Log Call (c)
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={createFollowUpTask}
                  >
                    Create follow-up task
                  </button>
                </>
              )}

              {nextBestAction?.mode === "neutral" && (
                <>
                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={() => {
                      setActivityType("call");
                      setToast("Activity mode: CALL");
                      setTimeout(() => subjectRef.current?.focus(), 0);
                    }}
                    title="Shortcut: c"
                  >
                    Log Call (c)
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={createFollowUpTask}
                  >
                    Create follow-up task
                  </button>
                </>
              )}

              {(nextBestAction?.mode === "active" ||
                nextBestAction?.mode === "stale-active") && (
                <>
                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={() => {
                      setActivityType("call");
                      setToast("Activity mode: CALL");
                      setTimeout(() => subjectRef.current?.focus(), 0);
                    }}
                    title="Shortcut: c"
                  >
                    Log Call (c)
                  </button>

                  <button
                    className="rounded-xl border bg-white px-4 py-2 hover:bg-gray-50"
                    onClick={sendEmailAndLog}
                  >
                    Send Email + Log
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={createFollowUpTask}
                  >
                    Create follow-up task
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={async () => {
                      const stepToOpen =
                        contact.cadence_status === "active" &&
                        (contact.cadence_step ?? 0) > 0
                          ? contact.cadence_step
                          : 1;

                      await loadCadencePreview(selectedCadence, stepToOpen);

                      setShowCadencePreviewPulse(true);
                      setTimeout(() => {
                        cadencePreviewRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }, 0);
                    }}
                  >
                    {contact.cadence_status === "active" && (contact.cadence_step ?? 0) > 0
                      ? `Open cadence step ${contact.cadence_step}`
                      : "Open cadence step"}
                  </button>
                </>
              )}

              {nextBestAction?.mode === "completed" && (
                <>
                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={() => {
                      setActivityType("call");
                      setToast("Activity mode: CALL");
                      setTimeout(() => subjectRef.current?.focus(), 0);
                    }}
                  >
                    Log Call
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={createFollowUpTask}
                  >
                    Create follow-up task
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    disabled={busy || cadenceBlocked || !canManageCadenceUi}
                    onClick={restartCadence}
                  >
                    Restart cadence
                  </button>
                </>
              )}

              {nextBestAction?.mode === "blocked" && (
                <>
                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={() => {
                      setActivityType("call");
                      setToast("Activity mode: CALL");
                      setTimeout(() => subjectRef.current?.focus(), 0);
                    }}
                  >
                    Log Call
                  </button>

                  <button
                    className="rounded-xl border px-4 py-2"
                    onClick={createFollowUpTask}
                  >
                    Create follow-up task
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Touch Timer</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Start before you call/email. Stop when you’re done.
            </div>
          </div>
          <div className="text-2xl font-semibold">
            {touchActivityId && touchElapsedSeconds != null
              ? fmtDuration(touchElapsedSeconds)
              : "—"}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            onClick={startTouch}
            disabled={!!touchActivityId || !canUseTouchTimerUi}
          >
            Start touch
          </button>
          <button
            className="rounded-xl border px-4 py-2"
            onClick={stopTouch}
            disabled={!touchActivityId || !canUseTouchTimerUi}
          >
            Stop touch
          </button>
        </div>

        {!canUseTouchTimerUi ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Claim or be assigned this contact to use touch tracking.
          </div>
        ) : null}
      </div>

      <CadenceStatusBanner
        contactId={contact.id}
        onExecute={() => {
          if (!canManageCadenceUi) {
            setErr("Claim or be assigned this contact to execute cadence.");
            return;
          }
          void sendEmailAndLog();
        }}
        onRepair={() => {
          if (!canRepairCadenceUi) {
            setErr("Only managers and admins can repair cadence.");
            return;
          }
          void repairCadence();
        }}
      />

      <div
        ref={cadencePreviewRef}
        className={[
          "rounded-2xl border p-5 transition-all",
          showCadencePreviewPulse ? "border-blue-400 ring-4 ring-blue-100" : "",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Cadence Step Preview</div>
            <div className="mt-1 text-xs text-muted-foreground">
              After starting cadence, send from here.
            </div>
          </div>
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => void loadCadencePreview()}
            disabled={!canManageCadenceUi}
          >
            {cadenceLoading ? "Loading..." : "Refresh preview"}
          </button>
        </div>

        {!cadencePreview ? (
          <div className="mt-4 text-sm text-muted-foreground">
            No preview loaded yet. Start cadence or click Refresh preview.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-muted-foreground">
              Cadence: <span className="font-semibold">{cadencePreview.cadence_key}</span> • Step:{" "}
              <span className="font-semibold">{cadencePreview.step}</span> • Required status:{" "}
              <span className="font-semibold">
                {cadencePreview.required_contact_status ?? "—"}
              </span>
            </div>

            <div className="mt-3">
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-blue-600"
                  style={{ width: `${Math.min(cadencePreview.step * 20, 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-muted-foreground">Subject</div>
              <div className="mt-1 text-sm font-semibold">{cadencePreview.subject}</div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-muted-foreground">Body</div>
              <div className="mt-2 whitespace-pre-wrap text-sm">{cadencePreview.body}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl border px-4 py-2"
                onClick={() => navigator.clipboard.writeText(cadencePreview.subject)}
              >
                Copy subject
              </button>
              <button
                className="rounded-xl border px-4 py-2"
                onClick={() => navigator.clipboard.writeText(cadencePreview.body)}
              >
                Copy body
              </button>
              <button
                className="rounded-xl border px-4 py-2"
                onClick={sendEmailAndLog}
                disabled={!canManageCadenceUi}
              >
                Send Email + Log
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Intelligence Timeline</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Combined view of activity, tasks, cadence events, assignment changes, and status
              changes.
            </div>
          </div>

          <button
            className="rounded-xl border px-4 py-2"
            disabled={timelineLoading}
            onClick={() => void loadTimeline()}
          >
            {timelineLoading ? "Loading..." : "Refresh timeline"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All", timelineCounts.all],
              ["cadence", "Cadence", timelineCounts.cadence],
              ["tasks", "Tasks", timelineCounts.tasks],
              ["activity", "Activity", timelineCounts.activity],
              ["status", "Status", timelineCounts.status],
              ["assignment", "Assignment", timelineCounts.assignment],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimelineFilter(key)}
              className={`rounded-full border px-3 py-1 text-sm ${
                timelineFilter === key ? "bg-slate-100 font-semibold" : ""
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {timelineLoading && groupedTimeline.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading timeline...</div>
        ) : groupedTimeline.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">
            No timeline events for this filter.
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {groupedTimeline.map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="mb-3 text-sm font-semibold text-slate-700">{dateLabel}</div>

                <div className="space-y-3">
                  {items.map((item) => {
                    const expanded = !!expandedTimelineBodies[item.id];
                    const collapsible = shouldCollapseBody(item.body);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-4 ${timelineTone(item.kind)}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm">{timelineIcon(item.kind)}</span>

                              <span className="rounded-full border bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                                {timelineLabel(item.kind)}
                              </span>

                              <span className="text-sm font-semibold">{item.title}</span>
                            </div>

                            {item.subtitle ? (
                              <div className="mt-1 text-sm text-muted-foreground">
                                {item.subtitle}
                              </div>
                            ) : null}

                            <div className="mt-1 text-xs text-muted-foreground">
                              {new Date(item.ts).toLocaleString()}
                              {item.actor ? ` • ${item.actor}` : ""}
                            </div>
                          </div>
                        </div>

                        {item.body ? (
                          <div className="mt-3">
                            <div className="whitespace-pre-wrap text-sm text-slate-700">
                              {collapsible && !expanded
                                ? truncatedBody(item.body)
                                : item.body}
                            </div>

                            {collapsible ? (
                              <button
                                type="button"
                                className="mt-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                                onClick={() =>
                                  setExpandedTimelineBodies((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                              >
                                {expanded ? "Show less" : "Show more"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={createTaskRef} className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Create Task</div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
          <input
            className="rounded-xl border px-3 py-2"
            placeholder="Title (optional)"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            disabled={!canCreateTaskUi}
          />
          <input
            type="date"
            className="rounded-xl border px-3 py-2"
            value={taskDue}
            onChange={(e) => setTaskDue(e.target.value)}
            disabled={!canCreateTaskUi}
          />
        </div>

        <textarea
          className="mt-3 w-full rounded-xl border px-3 py-2"
          placeholder="Notes (optional)"
          rows={3}
          value={taskNotes}
          onChange={(e) => setTaskNotes(e.target.value)}
          disabled={!canCreateTaskUi}
        />

        <div className="mt-3 flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            onClick={createManualTask}
            disabled={!canCreateTaskUi}
          >
            Add task
          </button>
        </div>

        {!canCreateTaskUi ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Claim or be assigned this contact to create tasks.
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Tasks</div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2">Due</th>
                <th className="py-2">Title</th>
                <th className="py-2">Status</th>
                <th className="py-2">Kind</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={4}>
                    No tasks.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2">{new Date(t.due_at).toLocaleString()}</td>
                    <td className="py-2">{t.title || "(no title)"}</td>
                    <td className="py-2">{t.status || "open"}</td>
                    <td className="py-2">{t.kind}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Log Activity</div>
        <div className="mt-1 text-xs text-muted-foreground">Shortcuts: c/e/t/m/n</div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
          <select
            className="rounded-xl border px-3 py-2"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            disabled={!canLogActivityUi}
          >
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="text">Text</option>
            <option value="meeting">Meeting</option>
          </select>

          <input
            ref={subjectRef}
            className="rounded-xl border px-3 py-2"
            placeholder="Subject (optional)"
            value={activitySubject}
            onChange={(e) => setActivitySubject(e.target.value)}
            disabled={!canLogActivityUi}
          />
        </div>

        <textarea
          className="mt-3 w-full rounded-xl border px-3 py-2"
          placeholder="Body / notes"
          rows={4}
          value={activityBody}
          onChange={(e) => setActivityBody(e.target.value)}
          disabled={!canLogActivityUi}
        />

        <input
          className="mt-3 w-full rounded-xl border px-3 py-2"
          placeholder="Outcome (optional)"
          value={activityOutcome}
          onChange={(e) => setActivityOutcome(e.target.value)}
          disabled={!canLogActivityUi}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {OUTCOME_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`rounded-xl border px-3 py-2 ${
                selectedOutcome === o.key ? "bg-slate-100" : ""
              }`}
              onClick={() => setSelectedOutcome(o.key)}
              disabled={!canLogActivityUi}
            >
              {o.label}
            </button>
          ))}
        </div>

        {selectedOutcome ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Saving this activity will also update the contact automatically based on outcome:{" "}
            <span className="font-semibold">{selectedOutcome}</span>
          </div>
        ) : null}

        <div className="mt-3 flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => logActivityViaApi()}
            disabled={!canLogActivityUi}
          >
            Save activity
          </button>
        </div>

        {!canLogActivityUi ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Claim or be assigned this contact to log activity.
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border p-5">
        <div className="text-lg font-semibold">Activity</div>

        <div className="mt-3 space-y-3">
          {activities.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {a.type.toUpperCase()} {a.subject ? `• ${a.subject}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(a.occurred_at).toLocaleString()}
                  </div>
                </div>

                {a.duration_seconds != null ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Touch time: {fmtDuration(a.duration_seconds)}
                  </div>
                ) : null}

                {a.body ? <div className="mt-2 whitespace-pre-wrap text-sm">{a.body}</div> : null}
                {a.outcome ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Outcome: {a.outcome}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}