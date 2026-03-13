import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";
import { scoreContact } from "@/lib/priorityEngine";
import { scoreAccountHeat } from "@/lib/accountHeat";

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

function daysSince(ts: string | null | undefined) {
  if (!ts) return 9999;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function normalizeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function inferBuyingCommitteeRole(jobTitleRaw: string | null | undefined): {
  key: BuyingCommitteeRole;
  label: string;
  confidence: "high" | "medium" | "low";
} {
  const title = normalizeLower(jobTitleRaw);

  if (!title) {
    return { key: "unknown", label: "Unknown Role", confidence: "low" };
  }

  if (
    title.includes("ceo") ||
    title.includes("cfo") ||
    title.includes("chief") ||
    title.includes("president") ||
    title.includes("owner") ||
    title.includes("founder") ||
    title.includes("managing partner")
  ) {
    return { key: "economic_buyer", label: "Economic Buyer", confidence: "high" };
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
    return { key: "technical_buyer", label: "Technical Buyer", confidence: "high" };
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
    return { key: "champion", label: "Champion / Influencer", confidence: "medium" };
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
    return { key: "operator", label: "Operator / End User", confidence: "medium" };
  }

  return { key: "unknown", label: "Unknown Role", confidence: "low" };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  let accessQuery = supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("vertical", "corporate")
    .eq("active", true)
    .limit(1);

  if (!privileged) {
    accessQuery = accessQuery.or(`assigned_to_user_id.eq.${me},owner_user_id.eq.${me}`);
  }

  const { data: accessibleRows, error: accessErr } = await accessQuery;

  if (accessErr) {
    return NextResponse.json({ error: accessErr.message }, { status: 500 });
  }

  if (!accessibleRows || accessibleRows.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let contactsQuery = supabaseAdmin
    .from("contacts")
    .select(`
      id,
      vertical,
      account_id,
      first_name,
      last_name,
      primary_email,
      job_title_raw,
      sport,
      status,
      cadence_status,
      cadence_step,
      cadence_next_due_at,
      last_activity_at,
      updated_at,
      assigned_to_user_id,
      owner_user_id,
      active,
      buying_committee_role_override
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
  const contactIds = contacts.map((c) => c.id);

  const { data: cpsData, error: cpsErr } = await supabaseAdmin.rpc("contact_priority_scores");
  if (cpsErr) {
    return NextResponse.json({ error: cpsErr.message }, { status: 500 });
  }

  const cpsById = new Map<string, any>(
    ((cpsData ?? []) as any[])
      .filter((r) => r.account_id === accountId)
      .map((r) => [String(r.id), r])
  );

  let recentActivities: any[] = [];
  if (contactIds.length > 0) {
    const { data: activities, error: activitiesErr } = await supabaseAdmin
      .from("activities")
      .select(`
        id,
        contact_id,
        type,
        occurred_at,
        subject,
        outcome
      `)
      .in("contact_id", contactIds)
      .order("occurred_at", { ascending: false })
      .limit(25);

    if (activitiesErr) {
      return NextResponse.json({ error: activitiesErr.message }, { status: 500 });
    }

    recentActivities = activities ?? [];
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
        company_size: scoreRow?.company_size ?? null,
        existing_score: Number(scoreRow?.score || 0),
      });

      const inferredRole = inferBuyingCommitteeRole(c.job_title_raw);
      const overrideRole = String(c.buying_committee_role_override || "").trim() as
        | BuyingCommitteeRole
        | "";

      const roleMap: Record<BuyingCommitteeRole, string> = {
        economic_buyer: "Economic Buyer",
        technical_buyer: "Technical Buyer",
        champion: "Champion / Influencer",
        operator: "Operator / End User",
        unknown: "Unknown Role",
      };

      const finalRoleKey: BuyingCommitteeRole = overrideRole
        ? (overrideRole as BuyingCommitteeRole)
        : inferredRole.key;

      return {
        id: c.id,
        first_name: c.first_name ?? null,
        last_name: c.last_name ?? null,
        full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(No name)",
        primary_email: c.primary_email ?? null,
        job_title_raw: c.job_title_raw ?? null,
        status: c.status ?? null,
        cadence_status: c.cadence_status ?? null,
        cadence_step: Number(c.cadence_step || 0),
        cadence_next_due_at: c.cadence_next_due_at ?? null,
        last_activity_at: c.last_activity_at ?? null,
        updated_at: c.updated_at ?? null,
        assigned_to_user_id: c.assigned_to_user_id ?? null,
        priority_score: scored.priority_score,
        momentum_label: scored.momentum_label,
        momentum_score: scored.momentum_score,
        priority_reason: scored.priority_reason,
        buying_committee_role: finalRoleKey,
        buying_committee_role_label: roleMap[finalRoleKey],
        buying_committee_confidence: overrideRole ? "high" : inferredRole.confidence,
        buying_committee_source: overrideRole ? "manual" : "inferred",
        buying_committee_role_override: overrideRole || null,
      };
    })
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return b.momentum_score - a.momentum_score;
    });

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const totalContacts = enrichedContacts.length;
  const activeCadences = enrichedContacts.filter((c) => c.cadence_status === "active").length;
  const staleContacts = enrichedContacts.filter(
    (c) => !c.last_activity_at || daysSince(c.last_activity_at) >= 14
  ).length;
  const touchedLast7Days = enrichedContacts.filter((c) => {
    if (!c.last_activity_at) return false;
    const ts = new Date(c.last_activity_at).getTime();
    return Number.isFinite(ts) && now - ts <= sevenDaysMs;
  }).length;

  const securedActiveContacts = enrichedContacts.filter(
    (c) => c.status === "Secured/Active"
  ).length;

  const topContact = enrichedContacts[0] ?? null;
  const mostRecentActivity = recentActivities[0] ?? null;

  const committeeCounts = {
    economic_buyer: enrichedContacts.filter((c) => c.buying_committee_role === "economic_buyer").length,
    technical_buyer: enrichedContacts.filter((c) => c.buying_committee_role === "technical_buyer").length,
    champion: enrichedContacts.filter((c) => c.buying_committee_role === "champion").length,
    operator: enrichedContacts.filter((c) => c.buying_committee_role === "operator").length,
    unknown: enrichedContacts.filter((c) => c.buying_committee_role === "unknown").length,
  };

  const coverage = {
    has_economic_buyer: committeeCounts.economic_buyer > 0,
    has_technical_buyer: committeeCounts.technical_buyer > 0,
    has_champion: committeeCounts.champion > 0,
    has_operator: committeeCounts.operator > 0,
  };

  const heat = scoreAccountHeat({
    total_contacts: totalContacts,
    active_cadences: activeCadences,
    touched_last_7_days: touchedLast7Days,
    stale_contacts: staleContacts,
    secured_active_contacts: securedActiveContacts,
    highest_priority_score: topContact?.priority_score ?? 0,
    most_recent_activity_at: mostRecentActivity?.occurred_at ?? null,
    buying_committee_coverage: coverage,
  });

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
    summary: {
      total_contacts: totalContacts,
      active_cadences: activeCadences,
      stale_contacts: staleContacts,
      touched_last_7_days: touchedLast7Days,
      secured_active_contacts: securedActiveContacts,
      most_recent_activity_at: mostRecentActivity?.occurred_at ?? null,
      most_recent_activity_subject: mostRecentActivity?.subject ?? null,
      highest_priority_contact_id: topContact?.id ?? null,
      highest_priority_contact_name: topContact?.full_name ?? null,
      highest_priority_score: topContact?.priority_score ?? 0,
    },
    heat,
    buying_committee: {
      total_identified_roles:
        committeeCounts.economic_buyer +
        committeeCounts.technical_buyer +
        committeeCounts.champion +
        committeeCounts.operator,
      roles: committeeCounts,
      coverage,
    },
    contacts: enrichedContacts.slice(0, 12),
    recent_activity: recentActivities.slice(0, 8),
  });
}