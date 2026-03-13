import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";
import { scoreContact } from "@/lib/priorityEngine";

export const runtime = "nodejs";

type Vertical = "coaching" | "corporate";

type BuyingCommitteeRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "operator"
  | "unknown";

function normalizeVertical(value: unknown): Vertical {
  return value === "corporate" ? "corporate" : "coaching";
}

function normalizeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function daysSince(ts: string | null | undefined) {
  if (!ts) return 9999;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function inferBuyingCommitteeRole(jobTitleRaw: string | null | undefined): BuyingCommitteeRole {
  const title = normalizeLower(jobTitleRaw);

  if (!title) return "unknown";

  if (
    title.includes("ceo") ||
    title.includes("cfo") ||
    title.includes("chief") ||
    title.includes("president") ||
    title.includes("owner") ||
    title.includes("founder") ||
    title.includes("managing partner")
  ) {
    return "economic_buyer";
  }

  if (
    title.includes("cto") ||
    title.includes("cio") ||
    title.includes("vp engineering") ||
    title.includes("engineering") ||
    title.includes("architect") ||
    title.includes("it") ||
    title.includes("security") ||
    title.includes("technology") ||
    title.includes("platform") ||
    title.includes("infrastructure") ||
    title.includes("systems")
  ) {
    return "technical_buyer";
  }

  if (
    title.includes("vp") ||
    title.includes("vice president") ||
    title.includes("head") ||
    title.includes("director") ||
    title.includes("gm") ||
    title.includes("general manager") ||
    title.includes("principal")
  ) {
    return "champion";
  }

  if (
    title.includes("manager") ||
    title.includes("lead") ||
    title.includes("coordinator") ||
    title.includes("specialist") ||
    title.includes("analyst") ||
    title.includes("administrator") ||
    title.includes("operations") ||
    title.includes("procurement") ||
    title.includes("recruiter")
  ) {
    return "operator";
  }

  return "unknown";
}

function roleLabel(role: BuyingCommitteeRole) {
  switch (role) {
    case "economic_buyer":
      return "Economic Buyer";
    case "technical_buyer":
      return "Technical Buyer";
    case "champion":
      return "Champion";
    case "operator":
      return "Operator";
    default:
      return "Unknown";
  }
}

function roleCoverageFlags(groups: Record<BuyingCommitteeRole, any[]>) {
  return {
    has_economic_buyer: groups.economic_buyer.length > 0,
    has_technical_buyer: groups.technical_buyer.length > 0,
    has_champion: groups.champion.length > 0,
    has_operator: groups.operator.length > 0,
  };
}

function inferSequencingIntelligence(args: {
  contacts: any[];
  topContact: any | null;
  timeline: any[];
  roleGroups: Record<BuyingCommitteeRole, any[]>;
}) {
  const { contacts, topContact, timeline, roleGroups } = args;

  const now = Date.now();

  const dueNow = contacts.filter((c) => {
    if (c.status !== "New") return false;
    if (c.cadence_status !== "active") return false;
    if (!c.cadence_next_due_at) return false;
    const due = new Date(c.cadence_next_due_at).getTime();
    return Number.isFinite(due) && due <= now;
  });

  const uncovered = contacts.filter((c) => {
    if (c.status !== "New") return false;
    return c.cadence_status !== "active";
  });

  const staleActive = contacts.filter((c) => {
    if (c.status !== "New") return false;
    if (c.cadence_status !== "active") return false;
    if (!c.last_activity_at) return true;
    return daysSince(c.last_activity_at) >= 7;
  });

  const coverage = roleCoverageFlags(roleGroups);

  const totalContacts = contacts.length;
  const accountTouchedRecently =
    timeline.length > 0 &&
    timeline[0]?.occurred_at &&
    daysSince(timeline[0].occurred_at) <= 7;

  const riskFlags: string[] = [];
  if (!coverage.has_economic_buyer) riskFlags.push("Missing Economic Buyer");
  if (!coverage.has_technical_buyer) riskFlags.push("Missing Technical Buyer");
  if (!coverage.has_champion) riskFlags.push("Missing Champion");
  if (totalContacts <= 1) riskFlags.push("Single-threaded account risk");
  if (!accountTouchedRecently) riskFlags.push("No account touch in 7+ days");
  if (staleActive.length > 0) {
    riskFlags.push(
      `${staleActive.length} stale active sequence${staleActive.length === 1 ? "" : "s"}`
    );
  }

  let accountMode: "widen" | "deepen" | "execute_now" | "recover" | "monitor" = "monitor";
  let primaryRecommendation = "Monitor account motion and continue current execution.";
  const rationale: string[] = [];
  const nextSteps: {
    kind:
      | "work_hottest_contact"
      | "start_uncovered"
      | "restart_stale"
      | "find_missing_economic_buyer"
      | "find_missing_technical_buyer"
      | "work_due_now";
    label: string;
  }[] = [];

  if (dueNow.length > 0) {
    accountMode = "execute_now";
    primaryRecommendation =
      "Execute due-now stakeholders first before widening or restarting other threads.";
    rationale.push(
      `${dueNow.length} stakeholder${dueNow.length === 1 ? "" : "s"} have cadence work due now.`
    );
    if (topContact) {
      rationale.push(`Highest priority contact is ${topContact.full_name}.`);
    }
    nextSteps.push({ kind: "work_due_now", label: "Work Due Now" });
    nextSteps.push({ kind: "work_hottest_contact", label: "Work Hottest Contact" });
    if (uncovered.length > 0) {
      nextSteps.push({ kind: "start_uncovered", label: "Start Uncovered" });
    }
  } else if ((!coverage.has_economic_buyer || !coverage.has_champion) && totalContacts < 3) {
    accountMode = "widen";
    primaryRecommendation =
      "Widen the account before deepening. Coverage is too thin for reliable forward motion.";
    if (!coverage.has_economic_buyer) {
      rationale.push("Economic Buyer is missing.");
      nextSteps.push({
        kind: "find_missing_economic_buyer",
        label: "Find Missing Economic Buyer",
      });
    }
    if (!coverage.has_technical_buyer) {
      rationale.push("Technical Buyer is missing.");
      nextSteps.push({
        kind: "find_missing_technical_buyer",
        label: "Find Missing Technical Buyer",
      });
    }
    if (!coverage.has_champion) {
      rationale.push("Champion is missing.");
    }
    if (uncovered.length > 0) {
      rationale.push(
        `${uncovered.length} uncovered stakeholder${uncovered.length === 1 ? "" : "s"} can be activated now.`
      );
      nextSteps.push({ kind: "start_uncovered", label: "Start Uncovered" });
    }
    if (topContact) {
      nextSteps.push({ kind: "work_hottest_contact", label: "Work Hottest Contact" });
    }
  } else if (staleActive.length > 0 || !accountTouchedRecently) {
    accountMode = "recover";
    primaryRecommendation =
      "Recover account motion by restarting stale sequences and reviving dormant stakeholders.";
    if (staleActive.length > 0) {
      rationale.push(
        `${staleActive.length} active sequence${staleActive.length === 1 ? "" : "s"} are stale.`
      );
      nextSteps.push({ kind: "restart_stale", label: "Restart Stale" });
    }
    if (!accountTouchedRecently) {
      rationale.push("No recent account touch detected in the last 7 days.");
    }
    if (topContact) {
      rationale.push(`Best recovery path starts with ${topContact.full_name}.`);
      nextSteps.push({ kind: "work_hottest_contact", label: "Work Hottest Contact" });
    }
  } else if (
    coverage.has_economic_buyer &&
    coverage.has_champion &&
    (coverage.has_technical_buyer || coverage.has_operator)
  ) {
    accountMode = "deepen";
    primaryRecommendation =
      "Deepen the strongest active thread. Coverage is good enough to push the account forward.";
    rationale.push("Core buyer coverage is present.");
    if (topContact) {
      rationale.push(`Best thread to deepen is ${topContact.full_name}.`);
      nextSteps.push({ kind: "work_hottest_contact", label: "Work Hottest Contact" });
    }
    if (uncovered.length > 0) {
      rationale.push(
        `${uncovered.length} additional stakeholder${uncovered.length === 1 ? "" : "s"} remain uncovered.`
      );
      nextSteps.push({ kind: "start_uncovered", label: "Start Uncovered" });
    }
  } else {
    accountMode = "monitor";
    primaryRecommendation =
      "Maintain current motion, add coverage where needed, and keep the account active.";
    if (topContact) {
      rationale.push(`Highest priority contact is ${topContact.full_name}.`);
      nextSteps.push({ kind: "work_hottest_contact", label: "Work Hottest Contact" });
    }
    if (uncovered.length > 0) {
      rationale.push(
        `${uncovered.length} stakeholder${uncovered.length === 1 ? "" : "s"} are uncovered.`
      );
      nextSteps.push({ kind: "start_uncovered", label: "Start Uncovered" });
    }
  }

  const recommendedContactIds = [
    ...dueNow.map((c) => c.id),
    ...staleActive.map((c) => c.id),
    ...uncovered.map((c) => c.id),
    ...contacts.map((c) => c.id),
  ].filter((id, idx, arr) => arr.indexOf(id) === idx).slice(0, 5);

  const recommendedContacts = recommendedContactIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      buying_committee_role: c.buying_committee_role,
      buying_committee_role_label: c.buying_committee_role_label,
      priority_score: c.priority_score,
      cadence_status: c.cadence_status,
      cadence_step: c.cadence_step,
      last_activity_at: c.last_activity_at,
      why_next:
        dueNow.find((x) => x.id === c.id)
          ? "Cadence due now"
          : staleActive.find((x) => x.id === c.id)
            ? "Stale active sequence"
            : uncovered.find((x) => x.id === c.id)
              ? "Uncovered stakeholder"
              : "Highest account priority",
    }));

  return {
    account_mode: accountMode,
    primary_recommendation: primaryRecommendation,
    rationale,
    recommended_contact_ids: recommendedContacts.map((c) => c.id),
    recommended_contacts: recommendedContacts,
    next_steps: nextSteps,
    risk_flags: riskFlags,
    stats: {
      due_now_count: dueNow.length,
      uncovered_count: uncovered.length,
      stale_active_count: staleActive.length,
      total_contacts: totalContacts,
    },
  };
}

function classifyTimelineKind(activityType: string | null, subject: string | null) {
  const type = normalizeLower(activityType);
  const lowerSubject = normalizeLower(subject);

  if (type === "call") return "call";
  if (type === "email") return "email";
  if (type === "meeting") return "meeting";
  if (type === "text") return "text";
  if (type === "touch") return "touch";
  if (type === "cadence") return "cadence";

  if (lowerSubject.includes("task")) return "task";
  if (lowerSubject.includes("status")) return "status";
  if (lowerSubject.includes("assignment")) return "assignment";

  return "note";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const me = auth.user.id;
    const { role, is_active } = await getRole(me);

    if (!is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const params = await context.params;
    const accountId = String(params.id || "").trim();

    if (!accountId) {
      return NextResponse.json({ error: "Account id required" }, { status: 400 });
    }

    const { data: account, error: accountErr } = await supabaseAdmin
      .from("accounts")
      .select(`
        id,
        name,
        industry,
        company_size,
        hq_location,
        website,
        active,
        created_at,
        updated_at
      `)
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr) {
      return NextResponse.json({ error: accountErr.message }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const privileged = isPrivileged(role);

    let contactsQuery = supabaseAdmin
      .from("contacts")
      .select(`
        id,
        vertical,
        account_id,
        first_name,
        last_name,
        primary_email,
        phone,
        job_title_raw,
        sport,
        status,
        cadence_key,
        cadence_status,
        cadence_step,
        cadence_next_due_at,
        last_activity_at,
        last_activity_type,
        last_activity_subject,
        updated_at,
        assigned_to_user_id,
        owner_user_id,
        buying_committee_role_override,
        active
      `)
      .eq("account_id", accountId)
      .eq("vertical", "corporate")
      .eq("active", true);

    if (!privileged) {
      contactsQuery = contactsQuery.or(`assigned_to_user_id.eq.${me},owner_user_id.eq.${me}`);
    }

    const { data: accountContacts, error: contactsErr } = await contactsQuery;

    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    const contacts = (accountContacts ?? []) as any[];

    if (contacts.length === 0) {
      return NextResponse.json({ error: "No accessible corporate contacts found on this account" }, { status: 404 });
    }

    const contactIds = contacts.map((c) => c.id);

    const { data: cpsData, error: cpsErr } = await supabaseAdmin.rpc("contact_priority_scores");
    if (cpsErr) {
      return NextResponse.json({ error: cpsErr.message }, { status: 500 });
    }

    const cpsById = new Map<string, any>(((cpsData ?? []) as any[]).map((r) => [String(r.id), r]));

    const { data: userProfiles } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, full_name, email");

    const repNameById = new Map<string, string>();
    for (const row of userProfiles ?? []) {
      repNameById.set(row.user_id, row.full_name || row.email || row.user_id);
    }

    const enrichedContacts = contacts
      .map((c) => {
        const scoreRow = cpsById.get(String(c.id));

        const scored = scoreContact({
          vertical: normalizeVertical(c.vertical),
          status: scoreRow?.status ?? c.status ?? null,
          cadence_status: scoreRow?.cadence_status ?? c.cadence_status ?? null,
          cadence_step: Number(scoreRow?.cadence_step ?? c.cadence_step ?? 0),
          last_activity_at: scoreRow?.last_activity_at ?? c.last_activity_at ?? null,
          updated_at: scoreRow?.updated_at ?? c.updated_at ?? null,
          cadence_next_due_at: scoreRow?.cadence_next_due_at ?? c.cadence_next_due_at ?? null,
          school_tier: null,
          account_tier: null,
          role_seniority: scoreRow?.role_seniority ?? c.job_title_raw ?? null,
          market_segment: scoreRow?.market_segment ?? account.industry ?? c.sport ?? null,
          buying_intent: scoreRow?.buying_intent ?? null,
          company_size: scoreRow?.company_size ?? account.company_size ?? null,
          existing_score: Number(scoreRow?.score || 0),
        });

        const buyingRole = (c.buying_committee_role_override || inferBuyingCommitteeRole(c.job_title_raw)) as BuyingCommitteeRole;

        return {
          id: c.id,
          full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(No name)",
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
          primary_email: c.primary_email ?? null,
          phone: c.phone ?? null,
          job_title_raw: c.job_title_raw ?? null,
          sport: c.sport ?? null,
          status: c.status ?? null,
          cadence_key: c.cadence_key ?? null,
          cadence_status: c.cadence_status ?? null,
          cadence_step: Number(c.cadence_step || 0),
          cadence_next_due_at: c.cadence_next_due_at ?? null,
          last_activity_at: c.last_activity_at ?? null,
          last_activity_type: c.last_activity_type ?? null,
          last_activity_subject: c.last_activity_subject ?? null,
          updated_at: c.updated_at ?? null,
          assigned_to_user_id: c.assigned_to_user_id ?? null,
          assigned_to_name: c.assigned_to_user_id
            ? repNameById.get(c.assigned_to_user_id) || c.assigned_to_user_id
            : "Unassigned",
          owner_user_id: c.owner_user_id ?? null,
          priority_score: scored.priority_score,
          momentum_score: scored.momentum_score,
          momentum_label: scored.momentum_label,
          priority_reason: scored.priority_reason,
          buying_committee_role: buyingRole,
          buying_committee_role_label: roleLabel(buyingRole),
        };
      })
      .sort((a, b) => {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return b.momentum_score - a.momentum_score;
      });

    const topContact = enrichedContacts[0] ?? null;

    let taskQuery = supabaseAdmin
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
      .in("contact_id", contactIds)
      .order("due_at", { ascending: true })
      .limit(100);

    if (!privileged) {
      taskQuery = taskQuery.or(`assigned_to_user_id.eq.${me},owner_user_id.eq.${me}`);
    }

    const { data: taskRows, error: tasksErr } = await taskQuery;

    if (tasksErr) {
      return NextResponse.json({ error: tasksErr.message }, { status: 500 });
    }

    const tasks = (taskRows ?? []).map((t: any) => {
      const matching = enrichedContacts.find((c) => c.id === t.contact_id);

      return {
        id: t.id,
        contact_id: t.contact_id,
        contact_name: matching?.full_name || "(No name)",
        assigned_to_user_id: t.assigned_to_user_id ?? null,
        assigned_to_name: t.assigned_to_user_id
          ? repNameById.get(t.assigned_to_user_id) || t.assigned_to_user_id
          : "Unassigned",
        title: t.title ?? null,
        task_type: t.task_type ?? null,
        due_at: t.due_at ?? null,
        completed_at: t.completed_at ?? null,
        notes: t.notes ?? null,
        status: t.status ?? null,
        kind: t.kind ?? null,
        cadence_key: t.cadence_key ?? null,
        cadence_step: t.cadence_step ?? null,
        created_at: t.created_at ?? null,
      };
    });

    let activityQuery = supabaseAdmin
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
        duration_seconds,
        created_at
      `)
      .in("contact_id", contactIds)
      .order("occurred_at", { ascending: false })
      .limit(150);

    if (!privileged) {
      activityQuery = activityQuery.eq("user_id", me);
    }

    const { data: activityRows, error: activitiesErr } = await activityQuery;

    if (activitiesErr) {
      return NextResponse.json({ error: activitiesErr.message }, { status: 500 });
    }

    const timeline = (activityRows ?? []).map((a: any) => {
      const matching = enrichedContacts.find((c) => c.id === a.contact_id);

      return {
        id: a.id,
        contact_id: a.contact_id,
        contact_name: matching?.full_name || "(No name)",
        occurred_at: a.occurred_at,
        type: a.type ?? null,
        kind: classifyTimelineKind(a.type, a.subject),
        subject: a.subject ?? null,
        body: a.body ?? null,
        outcome: a.outcome ?? null,
        duration_seconds: a.duration_seconds ?? null,
        user_id: a.user_id ?? null,
        actor_name: a.user_id ? repNameById.get(a.user_id) || a.user_id : null,
      };
    });

    const roleGroups: Record<BuyingCommitteeRole, typeof enrichedContacts> = {
      economic_buyer: enrichedContacts.filter((c) => c.buying_committee_role === "economic_buyer"),
      technical_buyer: enrichedContacts.filter((c) => c.buying_committee_role === "technical_buyer"),
      champion: enrichedContacts.filter((c) => c.buying_committee_role === "champion"),
      operator: enrichedContacts.filter((c) => c.buying_committee_role === "operator"),
      unknown: enrichedContacts.filter((c) => c.buying_committee_role === "unknown"),
    };

    const summary = {
  total_contacts: enrichedContacts.length,
  active_cadences: enrichedContacts.filter((c) => c.cadence_status === "active").length,
  stale_contacts: enrichedContacts.filter((c) => !c.last_activity_at || daysSince(c.last_activity_at) >= 10).length,
  touched_last_7_days: enrichedContacts.filter((c) => c.last_activity_at && daysSince(c.last_activity_at) <= 7).length,
  secured_active_contacts: enrichedContacts.filter((c) => c.status === "Secured/Active").length,
  open_tasks: tasks.filter((t) => !t.completed_at).length,
  highest_priority_score: topContact?.priority_score ?? 0,
  highest_priority_contact_id: topContact?.id ?? null,
  highest_priority_contact_name: topContact?.full_name ?? null,
  most_recent_activity_at: timeline[0]?.occurred_at ?? null,
  most_recent_activity_subject: timeline[0]?.subject ?? null,
};

const sequencingIntelligence = inferSequencingIntelligence({
  contacts: enrichedContacts,
  topContact,
  timeline,
  roleGroups,
});

const gaps: string[] = [];

    if (roleGroups.economic_buyer.length === 0) gaps.push("Missing Economic Buyer");
    if (roleGroups.technical_buyer.length === 0) gaps.push("Missing Technical Buyer");
    if (roleGroups.champion.length === 0) gaps.push("Missing Champion");
    if (roleGroups.operator.length === 0) gaps.push("Missing Operator");

    const staleStakeholders = enrichedContacts.filter((c) => !c.last_activity_at || daysSince(c.last_activity_at) >= 10).length;
    if (staleStakeholders > 0) gaps.push(`${staleStakeholders} stakeholder${staleStakeholders === 1 ? "" : "s"} stale > 10 days`);

    const activeCadenceCount = enrichedContacts.filter((c) => c.cadence_status === "active").length;
    if (enrichedContacts.length > 0 && activeCadenceCount < Math.min(2, enrichedContacts.length)) {
      gaps.push(`Cadence running on only ${activeCadenceCount} stakeholder${activeCadenceCount === 1 ? "" : "s"}`);
    }

    if ((timeline[0]?.occurred_at ? daysSince(timeline[0].occurred_at) : 9999) >= 7) {
      gaps.push("No account touch in 7+ days");
    }

    return NextResponse.json({
  account: {
    id: account.id,
    name: account.name,
    industry: account.industry ?? null,
    company_size: account.company_size ?? null,
    hq_location: account.hq_location ?? null,
    website: account.website ?? null,
    active: account.active,
    created_at: account.created_at ?? null,
    updated_at: account.updated_at ?? null,
  },
  summary,
  sequencing_intelligence: sequencingIntelligence,
  buying_committee: {
    economic_buyer: roleGroups.economic_buyer,
    technical_buyer: roleGroups.technical_buyer,
    champion: roleGroups.champion,
    operator: roleGroups.operator,
    unknown: roleGroups.unknown,
  },
  contacts: enrichedContacts,
  tasks,
  timeline,
  gaps,
});
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}