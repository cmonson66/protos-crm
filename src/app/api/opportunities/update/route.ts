import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSalesStageKey(value: unknown) {
  const raw = clean(value).toLowerCase();

  if (!raw) return "prospecting";

  const aliases: Record<string, string> = {
    prospect: "prospecting",
    prospecting: "prospecting",
    discovery: "discovery",
    present: "presentation",
    presentation: "presentation",
    close: "contract_signed",
    closed: "contract_signed",
    contract_signed: "contract_signed",
    contractsigned: "contract_signed",
    contractsignedwon: "contract_signed",
  };

  return aliases[raw] || raw;
}

const ALLOWED_STAGE_KEYS = new Set([
  "prospecting",
  "discovery",
  "presentation",
  "contract_signed",
]);

const ALLOWED_STATUS = new Set(["open", "closed_won", "closed_lost"]);

export async function POST(req: Request) {
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
  const opportunity_id = clean(body.opportunity_id);

  if (!opportunity_id) {
    return NextResponse.json({ error: "opportunity_id is required" }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("opportunities")
    .select(`
      id,
      assigned_to_user_id,
      owner_user_id,
      status,
      sales_stage_key,
      estimated_revenue,
      actual_revenue,
      contract_signed_at,
      closed_won_at,
      commission_paid_rep,
      commission_paid_at
    `)
    .eq("id", opportunity_id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const canEdit =
    isPrivileged(role) ||
    existing.assigned_to_user_id === me ||
    existing.owner_user_id === me;

  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();

  let nextSalesStageKey = String(existing.sales_stage_key || "prospecting");
  let nextStatus = String(existing.status || "open");
  let nextEstimatedRevenue = Number(existing.estimated_revenue || 0);
  let nextActualRevenue =
    existing.actual_revenue === null ? null : Number(existing.actual_revenue || 0);
  let nextCommissionPaidRep = Number(existing.commission_paid_rep || 0);

  if ("name" in body) {
    const value = clean(body.name);
    if (!value) {
      return NextResponse.json({ error: "name cannot be blank" }, { status: 400 });
    }
    patch.name = value;
  }

  if ("description" in body) patch.description = maybeNull(body.description);

  if ("sales_stage_key" in body) {
    const normalized = normalizeSalesStageKey(body.sales_stage_key);
    if (!ALLOWED_STAGE_KEYS.has(normalized)) {
      return NextResponse.json(
        {
          error: `Invalid sales_stage_key: ${normalized}`,
          allowed: Array.from(ALLOWED_STAGE_KEYS),
        },
        { status: 400 }
      );
    }
    patch.sales_stage_key = normalized;
    nextSalesStageKey = normalized;
  }

  if ("estimated_revenue" in body) {
    const value = toNumber(body.estimated_revenue);
    if (value < 0) {
      return NextResponse.json({ error: "estimated_revenue cannot be negative" }, { status: 400 });
    }
    patch.estimated_revenue = value;
    nextEstimatedRevenue = value;
  }

  if ("actual_revenue" in body) {
    nextActualRevenue =
      body.actual_revenue === "" || body.actual_revenue === null
        ? null
        : toNumber(body.actual_revenue);

    patch.actual_revenue = nextActualRevenue;
  }

  if ("status" in body) {
    const normalizedStatus = clean(body.status).toLowerCase();
    if (!ALLOWED_STATUS.has(normalizedStatus)) {
      return NextResponse.json(
        { error: `Invalid status: ${normalizedStatus}` },
        { status: 400 }
      );
    }
    patch.status = normalizedStatus;
    nextStatus = normalizedStatus;
  }

  if ("expected_close_date" in body) {
    patch.expected_close_date = maybeNull(body.expected_close_date);
  }

  if ("qualified_meeting_booked_at" in body) {
    patch.qualified_meeting_booked_at = maybeNull(body.qualified_meeting_booked_at);
  }

  if ("primary_contact_id" in body) {
    patch.primary_contact_id = maybeNull(body.primary_contact_id);
  }

  if ("product_catalog_id" in body) {
    patch.product_catalog_id = body.product_catalog_id ? Number(body.product_catalog_id) : null;
  }

  if ("product_family" in body) patch.product_family = maybeNull(body.product_family);
  if ("product_category" in body) patch.product_category = maybeNull(body.product_category);
  if ("product_subcategory" in body) patch.product_subcategory = maybeNull(body.product_subcategory);
  if ("product_name" in body) patch.product_name = maybeNull(body.product_name);

  if ("quantity" in body) {
    patch.quantity =
      body.quantity === "" || body.quantity === null ? null : toNumber(body.quantity);
  }

  if ("custom_product_name" in body) {
    patch.custom_product_name = maybeNull(body.custom_product_name);
  }

  if ("requires_approval" in body) {
    patch.requires_approval = Boolean(body.requires_approval);
  }

  if (isPrivileged(role) && "assigned_to_user_id" in body) {
    patch.assigned_to_user_id = maybeNull(body.assigned_to_user_id);
  }

  if (isPrivileged(role) && "commission_paid_rep" in body) {
    nextCommissionPaidRep = toNumber(body.commission_paid_rep);
    patch.commission_paid_rep = nextCommissionPaidRep;
  }

  if (isPrivileged(role) && "commission_paid_total" in body) {
    patch.commission_paid_total = toNumber(body.commission_paid_total);
  }

  if (isPrivileged(role) && "commission_paid_at" in body) {
    patch.commission_paid_at = maybeNull(body.commission_paid_at);
  }

  if (isPrivileged(role) && "closed_won_at" in body) {
    patch.closed_won_at = maybeNull(body.closed_won_at);
  }

  if ("contract_signed_at" in body) {
    patch.contract_signed_at = maybeNull(body.contract_signed_at);
  }

  const isNowContractSigned = nextSalesStageKey === "contract_signed";
  const isNowClosedWon = nextStatus === "closed_won";

  if (isNowContractSigned && !existing.contract_signed_at && !("contract_signed_at" in patch)) {
    patch.contract_signed_at = nowIso;
  }

  if (isNowClosedWon) {
    if (!existing.closed_won_at && !("closed_won_at" in patch)) {
      patch.closed_won_at = nowIso;
    }

    if (nextActualRevenue == null) {
      patch.actual_revenue = nextEstimatedRevenue;
      nextActualRevenue = nextEstimatedRevenue;
    }

    if (!existing.contract_signed_at && !("contract_signed_at" in patch)) {
      patch.contract_signed_at = nowIso;
    }
  }

  const prevCommissionPaidRep = Number(existing.commission_paid_rep || 0);
  const incomingCommissionPaidAt = "commission_paid_at" in patch;

  if (!incomingCommissionPaidAt) {
    if (nextCommissionPaidRep > 0 && prevCommissionPaidRep <= 0 && !existing.commission_paid_at) {
      patch.commission_paid_at = nowIso;
    } else if (nextCommissionPaidRep <= 0) {
      patch.commission_paid_at = null;
    }
  }

  patch.updated_at = nowIso;

  const { error } = await supabaseAdmin
    .from("opportunities")
    .update(patch)
    .eq("id", opportunity_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}