import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

const ALLOWED_STATUS = new Set(["draft", "active", "archived"]);
const ALLOWED_CHANNELS = new Set(["email", "linkedin", "call_script"]);
const ALLOWED_TEMPLATE_TYPES = new Set([
  "cadence",
  "product_followup",
  "linkedin_outreach",
  "call_script",
]);
const ALLOWED_VERTICALS = new Set(["athletics", "corporate"]);
const ALLOWED_AUDIENCE_STAGES = new Set(["new", "secured_active"]);

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { role, is_active } = await getRole(auth.user.id);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    const channel = clean(body.channel);
    const templateType = clean(body.template_type);
    const status = clean(body.status || "draft");
    const vertical = clean(body.vertical);
    const audienceStage = clean(body.audience_stage || "new");

    const payload = {
      name: clean(body.name),
      template_key: maybeNull(body.template_key),
      status,
      channel,
      template_type: templateType,
      template_scope: maybeNull(body.template_scope),
      audience_stage: audienceStage,
      vertical,
      product_tree_family: maybeNull(body.product_tree_family),
      product_tree_category: maybeNull(body.product_tree_category),
      product_tree_subcategory: maybeNull(body.product_tree_subcategory),
      product_tree_item: maybeNull(body.product_tree_item),
      subject_template: channel === "email" ? maybeNull(body.subject_template) : null,
      body_template: clean(body.body_template),
      call_to_action: maybeNull(body.call_to_action),
      created_by: auth.user.id,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    };

    if (!payload.name || !payload.body_template || !channel || !templateType || !vertical) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (!ALLOWED_CHANNELS.has(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    if (!ALLOWED_TEMPLATE_TYPES.has(templateType)) {
      return NextResponse.json({ error: "Invalid template_type" }, { status: 400 });
    }

    if (!ALLOWED_VERTICALS.has(vertical)) {
      return NextResponse.json({ error: "Invalid vertical" }, { status: 400 });
    }

    if (!ALLOWED_AUDIENCE_STAGES.has(audienceStage)) {
      return NextResponse.json({ error: "Invalid audience_stage" }, { status: 400 });
    }

    if (channel === "email" && !payload.subject_template) {
      return NextResponse.json(
        { error: "Email templates require subject_template" },
        { status: 400 }
      );
    }

    if (channel !== "email" && payload.subject_template) {
      return NextResponse.json(
        { error: "Only email templates may include subject_template" },
        { status: 400 }
      );
    }

    if (channel === "linkedin" && templateType !== "linkedin_outreach" && templateType !== "cadence") {
      return NextResponse.json(
        { error: "LinkedIn templates must use linkedin_outreach or cadence" },
        { status: 400 }
      );
    }

    if (channel === "call_script" && templateType !== "call_script" && templateType !== "cadence") {
      return NextResponse.json(
        { error: "Call Script templates must use call_script or cadence" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("message_templates")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create template" },
      { status: 500 }
    );
  }
}