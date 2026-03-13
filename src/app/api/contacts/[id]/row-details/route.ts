import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";
import { scoreContact } from "@/lib/priorityEngine";

export const runtime = "nodejs";

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeVertical(value: unknown): "coaching" | "corporate" {
  return value === "corporate" ? "corporate" : "coaching";
}

function buildNextBestAction(contact: {
  vertical: "coaching" | "corporate";
  status: string;
  cadence_status: string | null;
  cadence_step: number | null;
  cadence_key: string | null;
}) {
  if (contact.status !== "New" && contact.status !== "Secured/Active") {
    return {
      kind: "change_status" as const,
      label:
        contact.vertical === "corporate"
          ? "Review account status and open contact"
          : "Review recruiting status and open contact",
    };
  }

  if (!contact.cadence_key || contact.cadence_status === "inactive") {
    return {
      kind: "start_cadence" as const,
      label:
        contact.vertical === "corporate"
          ? "Start outreach cadence"
          : "Start recruiting cadence",
    };
  }

  if (contact.cadence_status === "active") {
    return {
      kind: "open_cadence_step" as const,
      label: `Open cadence step ${contact.cadence_step || 1}`,
    };
  }

  if (contact.cadence_status === "completed" || contact.cadence_status === "stopped") {
    return {
      kind: "restart_cadence" as const,
      label:
        contact.vertical === "corporate"
          ? "Restart outreach cadence"
          : "Restart recruiting cadence",
    };
  }

  return {
    kind: "open_contact" as const,
    label: "Open contact",
  };
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
  const contactId = String(params.id || "").trim();

  if (!contactId) {
    return NextResponse.json({ error: "Contact id required" }, { status: 400 });
  }

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      vertical,
      first_name,
      last_name,
      primary_email,
      sport,
      status,
      assigned_to_user_id,
      owner_user_id,
      cadence_key,
      cadence_step,
      cadence_status,
      cadence_next_due_at,
      last_activity_at,
      updated_at,
      account_id,
      school_id
    `)
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (
    !isPrivileged(role) &&
    contact.assigned_to_user_id !== me &&
    contact.owner_user_id !== me
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: scoreRows, error: scoreErr } = await supabaseAdmin.rpc("contact_priority_scores");
  if (scoreErr) {
    return NextResponse.json({ error: scoreErr.message }, { status: 500 });
  }

  const scoreRow =
    Array.isArray(scoreRows) ? scoreRows.find((r: any) => r.id === contactId) : null;

  const vertical = normalizeVertical(scoreRow?.vertical ?? contact.vertical);

  const scored = scoreContact({
    vertical,
    status: scoreRow?.status ?? contact.status ?? null,
    cadence_status: scoreRow?.cadence_status ?? contact.cadence_status ?? null,
    cadence_step: Number(scoreRow?.cadence_step ?? contact.cadence_step ?? 0),
    last_activity_at: scoreRow?.last_activity_at ?? contact.last_activity_at ?? null,
    updated_at: scoreRow?.updated_at ?? contact.updated_at ?? null,
    cadence_next_due_at: scoreRow?.cadence_next_due_at ?? contact.cadence_next_due_at ?? null,
    school_tier: scoreRow?.school_tier ?? null,
    account_tier: null,
    role_seniority: scoreRow?.role_seniority ?? null,
    market_segment: scoreRow?.market_segment ?? null,
    buying_intent: scoreRow?.buying_intent ?? null,
    company_size: scoreRow?.company_size ?? null,
    existing_score: Number(scoreRow?.score || 0),
  });

  const priorityScore = Number(scored.priority_score || 0);

  const derivedSchoolTier =
    toNumberOrNull(scoreRow?.school_tier) ??
    null;

  const schoolName =
    (typeof scoreRow?.school_name === "string" && scoreRow.school_name.trim()) || null;

  const accountName =
    (typeof scoreRow?.account_name === "string" && scoreRow.account_name.trim()) || null;

  const orgName =
    (typeof scoreRow?.org_name === "string" && scoreRow.org_name.trim()) ||
    accountName ||
    schoolName ||
    null;

  const { data: lastActivity, error: lastActivityErr } = await supabaseAdmin
    .from("activities")
    .select(`
      id,
      type,
      occurred_at,
      subject,
      body,
      outcome
    `)
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastActivityErr) {
    return NextResponse.json({ error: lastActivityErr.message }, { status: 500 });
  }

  const { data: notes, error: notesErr } = await supabaseAdmin
    .from("activities")
    .select(`
      id,
      body,
      occurred_at,
      created_at
    `)
    .eq("contact_id", contactId)
    .eq("type", "note")
    .order("occurred_at", { ascending: false })
    .limit(5);

  if (notesErr) {
    return NextResponse.json({ error: notesErr.message }, { status: 500 });
  }

  let cadencePreview: {
    cadence_key: string;
    step: number;
    subject: string | null;
    body: string | null;
    due_offset_days: number | null;
  } | null = null;

  if (contact.cadence_key && Number(contact.cadence_step || 0) > 0) {
    const { data: templateStep, error: templateErr } = await supabaseAdmin
      .from("cadence_template_steps")
      .select(`
        cadence_key,
        step,
        subject,
        body,
        due_offset_days
      `)
      .eq("cadence_key", contact.cadence_key)
      .eq("step", Number(contact.cadence_step || 1))
      .maybeSingle();

    if (templateErr) {
      return NextResponse.json({ error: templateErr.message }, { status: 500 });
    }

    if (templateStep) {
      cadencePreview = {
        cadence_key: String(templateStep.cadence_key),
        step: Number(templateStep.step || 0),
        subject: templateStep.subject ?? null,
        body: templateStep.body ?? null,
        due_offset_days: templateStep.due_offset_days ?? null,
      };
    }
  }

  const fullName =
    `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "(No name)";

  const response = {
    contact: {
      id: contact.id,
      vertical,
      full_name: fullName,
      org_name: orgName,
      account_name: accountName,
      school_name: schoolName,
      sport: contact.sport ?? null,
      status: contact.status,
      cadence_key: contact.cadence_key ?? null,
      cadence_step: Number(contact.cadence_step || 0),
      cadence_status: contact.cadence_status ?? null,
      cadence_next_due_at: contact.cadence_next_due_at ?? null,
      priority_score: priorityScore,
      school_tier: derivedSchoolTier,
      role_seniority: scoreRow?.role_seniority ?? null,
      market_segment: scoreRow?.market_segment ?? null,
      buying_intent: scoreRow?.buying_intent ?? null,
      company_size: toNumberOrNull(scoreRow?.company_size),
    },
    lastActivity: lastActivity
      ? {
          id: lastActivity.id,
          type: lastActivity.type,
          occurred_at: lastActivity.occurred_at,
          subject: lastActivity.subject ?? null,
          body: lastActivity.body ?? null,
          outcome: lastActivity.outcome ?? null,
        }
      : null,
    priorityBreakdown: scored.breakdown,
    cadencePreview,
    nextBestAction: buildNextBestAction({
      vertical,
      status: contact.status,
      cadence_status: contact.cadence_status ?? null,
      cadence_step: Number(contact.cadence_step || 0),
      cadence_key: contact.cadence_key ?? null,
    }),
    notes: Array.isArray(notes)
      ? notes.map((n) => ({
          id: n.id,
          body: n.body ?? "",
          occurred_at: n.occurred_at,
          created_at: n.created_at ?? null,
        }))
      : [],
  };

  return NextResponse.json(response);
}