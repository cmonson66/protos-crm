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

function normalizeVertical(value: unknown) {
  const raw = clean(value).toLowerCase();
  if (raw === "coaching") return "athletics";
  if (raw === "athletics") return "athletics";
  if (raw === "corporate") return "corporate";
  return raw;
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

  const vertical = normalizeVertical(body.vertical);
  const school_id = maybeNull(body.school_id);
  const account_id = maybeNull(body.account_id);
  const primary_contact_id = maybeNull(body.primary_contact_id);

  const assigned_to_user_id = isPrivileged(role)
    ? maybeNull(body.assigned_to_user_id)
    : me;

  const name = clean(body.name);
  const description = maybeNull(body.description);

  const sales_stage_key = normalizeSalesStageKey(body.sales_stage_key);
  const estimated_revenue = toNumber(body.estimated_revenue);

  const expected_close_date = maybeNull(body.expected_close_date);
  const qualified_meeting_booked_at = maybeNull(body.qualified_meeting_booked_at);

  const product_catalog_id = body.product_catalog_id ? Number(body.product_catalog_id) : null;
  const product_family = maybeNull(body.product_family);
  const product_category = maybeNull(body.product_category);
  const product_subcategory = maybeNull(body.product_subcategory);
  const product_name = maybeNull(body.product_name);
  const quantity =
    body.quantity === null || body.quantity === undefined || body.quantity === ""
      ? null
      : toNumber(body.quantity);
  const custom_product_name = maybeNull(body.custom_product_name);
  const requires_approval = Boolean(body.requires_approval);

  if (!["athletics", "corporate"].includes(vertical)) {
    return NextResponse.json({ error: "Invalid vertical" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!ALLOWED_STAGE_KEYS.has(sales_stage_key)) {
    return NextResponse.json(
      {
        error: `Invalid sales_stage_key: ${sales_stage_key}`,
        allowed: Array.from(ALLOWED_STAGE_KEYS),
      },
      { status: 400 }
    );
  }

  if (estimated_revenue <= 0) {
    return NextResponse.json(
      { error: "estimated_revenue must be greater than 0" },
      { status: 400 }
    );
  }

  if (vertical === "athletics" && !school_id) {
    return NextResponse.json(
      { error: "school_id is required for athletics opportunities" },
      { status: 400 }
    );
  }

  if (vertical === "corporate" && !account_id) {
    return NextResponse.json(
      { error: "account_id is required for corporate opportunities" },
      { status: 400 }
    );
  }

  if (!primary_contact_id) {
    return NextResponse.json(
      { error: "primary_contact_id is required" },
      { status: 400 }
    );
  }

  const insertRow = {
    vertical,
    school_id: vertical === "athletics" ? school_id : null,
    account_id: vertical === "corporate" ? account_id : null,
    primary_contact_id,
    contact_id: primary_contact_id,
    owner_user_id: me,
    assigned_to_user_id,
    name,
    description,
    sales_stage_key,
    estimated_revenue,
    expected_close_date,
    qualified_meeting_booked_at,
    product_catalog_id,
    product_family,
    product_category,
    product_subcategory,
    product_name,
    quantity,
    custom_product_name,
    requires_approval,
  };

  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        context: "opportunities.create",
      },
      { status: 500 }
    );
  }

  const activityLines = [
    `Opportunity created: ${name}`,
    `Vertical: ${vertical}`,
    `Stage: ${sales_stage_key}`,
    `Estimated revenue: ${estimated_revenue}`,
    assigned_to_user_id ? `Assigned to: ${assigned_to_user_id}` : "Assigned to: unassigned",
    expected_close_date ? `Expected close: ${expected_close_date}` : null,
    description ? `Description: ${description}` : null,
  ].filter(Boolean);

  await supabaseAdmin.from("activities").insert({
    contact_id: primary_contact_id,
    user_id: me,
    type: "note",
    occurred_at: new Date().toISOString(),
    subject: `Opportunity created: ${name}`,
    body: activityLines.join("\n"),
    outcome: "opportunity_created",
  });

  return NextResponse.json({ ok: true, opportunity_id: data.id });
}