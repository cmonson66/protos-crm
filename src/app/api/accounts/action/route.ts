import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";
import { scoreContact } from "@/lib/priorityEngine";

export const runtime = "nodejs";

type BuyingCommitteeRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "operator"
  | "unknown";

type AccountAction =
  | "work_hottest_contact"
  | "create_account_task"
  | "find_missing_buyer";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

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

function missingRoleLabels(roles: {
  has_economic_buyer: boolean;
  has_technical_buyer: boolean;
  has_champion: boolean;
  has_operator: boolean;
}) {
  const missing: string[] = [];
  if (!roles.has_economic_buyer) missing.push("Economic Buyer");
  if (!roles.has_technical_buyer) missing.push("Technical Buyer");
  if (!roles.has_champion) missing.push("Champion");
  if (!roles.has_operator) missing.push("Operator");
  return missing;
}

export async function POST(req: Request) {
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

    const body = await req.json().catch(() => ({}));
    const action = clean(body.action) as AccountAction;
    const accountId = clean(body.account_id);
    const titleInput = clean(body.title);
    const notesInput = clean(body.notes);
    const dueDays = Math.max(0, Number(body.due_days || 0));

    if (!accountId) {
      return NextResponse.json({ error: "account_id is required" }, { status: 400 });
    }

    if (
      action !== "work_hottest_contact" &&
      action !== "create_account_task" &&
      action !== "find_missing_buyer"
    ) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
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
        active
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
        active
      `)
      .eq("account_id", accountId)
      .eq("vertical", "corporate")
      .eq("active", true);

    if (!privileged) {
      contactsQuery = contactsQuery.or(`assigned_to_user_id.eq.${me},owner_user_id.eq.${me}`);
    }

    const { data: contacts, error: contactsErr } = await contactsQuery;

    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    const contactRows = (contacts ?? []) as any[];

    if (contactRows.length === 0) {
      return NextResponse.json(
        { error: "No accessible corporate contacts found on this account" },
        { status: 404 }
      );
    }

    const { data: cpsData, error: cpsErr } = await supabaseAdmin.rpc("contact_priority_scores");
    if (cpsErr) {
      return NextResponse.json({ error: cpsErr.message }, { status: 500 });
    }

    const cpsById = new Map<string, any>(((cpsData ?? []) as any[]).map((r) => [String(r.id), r]));

    const enriched = contactRows
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
          account_tier: null,
          role_seniority: scoreRow?.role_seniority ?? c.job_title_raw ?? null,
          market_segment: scoreRow?.market_segment ?? account.industry ?? c.sport ?? null,
          buying_intent: scoreRow?.buying_intent ?? null,
          company_size: scoreRow?.company_size ?? null,
          existing_score: Number(scoreRow?.score || 0),
        });

        return {
          ...c,
          computed_priority_score: scored.priority_score,
          computed_momentum_score: scored.momentum_score,
          committee_role: inferBuyingCommitteeRole(c.job_title_raw),
        };
      })
      .sort((a, b) => {
        if (b.computed_priority_score !== a.computed_priority_score) {
          return b.computed_priority_score - a.computed_priority_score;
        }
        return b.computed_momentum_score - a.computed_momentum_score;
      });

    const topContact = enriched[0];
    if (!topContact?.id) {
      return NextResponse.json({ error: "No ranked contact found" }, { status: 404 });
    }

    const coverage = {
      has_economic_buyer: enriched.some((c) => c.committee_role === "economic_buyer"),
      has_technical_buyer: enriched.some((c) => c.committee_role === "technical_buyer"),
      has_champion: enriched.some((c) => c.committee_role === "champion"),
      has_operator: enriched.some((c) => c.committee_role === "operator"),
    };

    const missingRoles = missingRoleLabels(coverage);
    const nowIso = new Date().toISOString();
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + dueDays);

    const assignee = topContact.assigned_to_user_id || me;
    const owner = topContact.owner_user_id || me;

    if (action === "work_hottest_contact") {
      const { data: existingOpenTask, error: existingErr } = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("contact_id", topContact.id)
        .eq("kind", "manual")
        .is("completed_at", null)
        .order("due_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        return NextResponse.json({ error: existingErr.message }, { status: 500 });
      }

      let taskId: string | null = null;

      if (existingOpenTask?.id) {
        const { error: updateErr } = await supabaseAdmin
          .from("tasks")
          .update({
            due_at: nowIso,
            status: "open",
            assigned_to_user_id: assignee,
            owner_user_id: owner,
            title: `Work Hottest Contact: ${account.name}`,
            notes: `Account Radar action. Work highest-priority contact on account ${account.name}.`,
          })
          .eq("id", existingOpenTask.id);

        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        taskId = existingOpenTask.id;
      } else {
        const { data: insertedTask, error: insertErr } = await supabaseAdmin
          .from("tasks")
          .insert({
            contact_id: topContact.id,
            assigned_to_user_id: assignee,
            owner_user_id: owner,
            task_type: "follow_up",
            due_at: nowIso,
            title: `Work Hottest Contact: ${account.name}`,
            notes: `Account Radar action. Work highest-priority contact on account ${account.name}.`,
            status: "open",
            kind: "manual",
            cadence_key: null,
            cadence_step: null,
          })
          .select("id")
          .single();

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }

        taskId = insertedTask.id;
      }

      await supabaseAdmin.from("activities").insert({
        contact_id: topContact.id,
        user_id: me,
        type: "note",
        occurred_at: nowIso,
        subject: "Account Radar action",
        body: `Work hottest contact action was triggered for account ${account.name}.`,
        outcome: "work_hottest_contact",
      });

      return NextResponse.json({
        ok: true,
        action,
        task_id: taskId,
        contact_id: topContact.id,
        account_id: account.id,
      });
    }

    if (action === "create_account_task") {
      const title = titleInput || `Account Task: ${account.name}`;
      const notes =
        notesInput ||
        `Account-level follow-up for ${account.name}. Coordinate outreach across stakeholders and advance the account.`;

      const { data: insertedTask, error: insertErr } = await supabaseAdmin
        .from("tasks")
        .insert({
          contact_id: topContact.id,
          assigned_to_user_id: assignee,
          owner_user_id: owner,
          task_type: "follow_up",
          due_at: dueAt.toISOString(),
          title,
          notes,
          status: "open",
          kind: "manual",
          cadence_key: null,
          cadence_step: null,
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      await supabaseAdmin.from("activities").insert({
        contact_id: topContact.id,
        user_id: me,
        type: "note",
        occurred_at: nowIso,
        subject: "Account task created",
        body: `Account-level task created for ${account.name}.`,
        outcome: "account_task_created",
      });

      return NextResponse.json({
        ok: true,
        action,
        task_id: insertedTask.id,
        contact_id: topContact.id,
        account_id: account.id,
      });
    }

    const buyerTaskTitle =
      missingRoles.length > 0
        ? `Find Missing Buyer: ${missingRoles.join(", ")}`
        : `Validate Buying Committee: ${account.name}`;

    const buyerTaskNotes =
      missingRoles.length > 0
        ? `Account ${account.name} is missing these roles: ${missingRoles.join(
            ", "
          )}. Identify or create a path to those stakeholders.`
        : `Buying committee appears covered on ${account.name}. Validate stakeholder map and fill any hidden gaps.`;

    const { data: insertedTask, error: insertErr } = await supabaseAdmin
      .from("tasks")
      .insert({
        contact_id: topContact.id,
        assigned_to_user_id: assignee,
        owner_user_id: owner,
        task_type: "follow_up",
        due_at: dueAt.toISOString(),
        title: buyerTaskTitle,
        notes: buyerTaskNotes,
        status: "open",
        kind: "manual",
        cadence_key: null,
        cadence_step: null,
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await supabaseAdmin.from("activities").insert({
      contact_id: topContact.id,
      user_id: me,
      type: "note",
      occurred_at: nowIso,
      subject: "Find missing buyer action",
      body: buyerTaskNotes,
      outcome: "find_missing_buyer",
    });

    return NextResponse.json({
      ok: true,
      action,
      task_id: insertedTask.id,
      contact_id: topContact.id,
      account_id: account.id,
      missing_roles: missingRoles,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Account action failed" },
      { status: 500 }
    );
  }
}