import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";
import { scoreContact } from "@/lib/priorityEngine";
import { scoreAccountHeat } from "@/lib/accountHeat";

export const runtime = "nodejs";

type BuyingCommitteeRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "operator"
  | "unknown";

function normalizeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
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

function daysSince(ts: string | null | undefined) {
  if (!ts) return 9999;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const privileged = isPrivileged(role);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 24)));

  const { data: accounts, error: accountsErr } = await supabaseAdmin
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
    .eq("active", true)
    .order("name", { ascending: true });

  if (accountsErr) {
    return NextResponse.json({ error: accountsErr.message }, { status: 500 });
  }

  let contactsQuery = supabaseAdmin
    .from("contacts")
    .select(`
      id,
      account_id,
      vertical,
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
    .eq("vertical", "corporate")
    .eq("active", true)
    .not("account_id", "is", null);

  if (!privileged) {
    contactsQuery = contactsQuery.or(`assigned_to_user_id.eq.${me},owner_user_id.eq.${me}`);
  }

  const { data: contacts, error: contactsErr } = await contactsQuery;

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const contactRows = (contacts ?? []) as any[];
  const accountIds = Array.from(new Set(contactRows.map((c) => String(c.account_id)).filter(Boolean)));

  const filteredAccounts = (accounts ?? []).filter((a) => accountIds.includes(String(a.id)));

  const { data: cpsData, error: cpsErr } = await supabaseAdmin.rpc("contact_priority_scores");
  if (cpsErr) {
    return NextResponse.json({ error: cpsErr.message }, { status: 500 });
  }

  const cpsById = new Map<string, any>(((cpsData ?? []) as any[]).map((r) => [String(r.id), r]));

  const contactIds = contactRows.map((c) => c.id);
  let activities: any[] = [];

  if (contactIds.length > 0) {
    const { data: activityRows, error: activitiesErr } = await supabaseAdmin
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
      .limit(500);

    if (activitiesErr) {
      return NextResponse.json({ error: activitiesErr.message }, { status: 500 });
    }

    activities = activityRows ?? [];
  }

  const data = filteredAccounts
    .map((account) => {
      const accountContacts = contactRows.filter((c) => c.account_id === account.id);

      const enrichedContacts = accountContacts
        .map((c) => {
          const scoreRow = cpsById.get(String(c.id));

          const scored = scoreContact({
            vertical: "corporate",
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

          const overrideRole = String(c.buying_committee_role_override || "").trim() as
            | BuyingCommitteeRole
            | "";

          const finalRole = overrideRole || inferBuyingCommitteeRole(c.job_title_raw);

          return {
            id: c.id,
            full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(No name)",
            job_title_raw: c.job_title_raw ?? null,
            status: c.status ?? null,
            cadence_status: c.cadence_status ?? null,
            cadence_step: Number(c.cadence_step || 0),
            last_activity_at: c.last_activity_at ?? null,
            priority_score: scored.priority_score,
            momentum_score: scored.momentum_score,
            buying_committee_role: finalRole,
          };
        })
        .sort((a, b) => {
          if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
          return b.momentum_score - a.momentum_score;
        });

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

      const accountActivity = activities
        .filter((a) => accountContacts.some((c) => c.id === a.contact_id))
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

      const totalContacts = enrichedContacts.length;
      const activeCadences = enrichedContacts.filter((c) => c.cadence_status === "active").length;
      const staleContacts = enrichedContacts.filter(
        (c) => !c.last_activity_at || daysSince(c.last_activity_at) >= 14
      ).length;
      const touchedLast7Days = enrichedContacts.filter(
        (c) => c.last_activity_at && daysSince(c.last_activity_at) <= 7
      ).length;
      const securedActiveContacts = enrichedContacts.filter(
        (c) => c.status === "Secured/Active"
      ).length;

      const topContact = enrichedContacts[0] ?? null;
      const mostRecentActivity = accountActivity[0] ?? null;

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

      return {
        account_id: account.id,
        name: account.name,
        industry: account.industry ?? null,
        company_size: account.company_size ?? null,
        hq_location: account.hq_location ?? null,
        website: account.website ?? null,
        total_contacts: totalContacts,
        active_cadences: activeCadences,
        stale_contacts: staleContacts,
        touched_last_7_days: touchedLast7Days,
        secured_active_contacts: securedActiveContacts,
        highest_priority_contact_id: topContact?.id ?? null,
        highest_priority_contact_name: topContact?.full_name ?? null,
        highest_priority_score: topContact?.priority_score ?? 0,
        most_recent_activity_at: mostRecentActivity?.occurred_at ?? null,
        buying_committee: {
          roles: committeeCounts,
          coverage,
        },
        heat,
      };
    })
    .sort((a, b) => {
      if (b.heat.account_heat_score !== a.heat.account_heat_score) {
        return b.heat.account_heat_score - a.heat.account_heat_score;
      }
      return b.highest_priority_score - a.highest_priority_score;
    })
    .slice(0, limit);

  return NextResponse.json({
    data,
    count: data.length,
  });
}