import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ALLOWED_CHANNELS = new Set(["email", "linkedin", "call_script"]);
const ALLOWED_TEMPLATE_TYPES = new Set([
  "cadence",
  "product_followup",
  "linkedin_outreach",
  "call_script",
]);
const ALLOWED_AUDIENCE_STAGES = new Set(["new", "secured_active"]);
const ALLOWED_VERTICALS = new Set(["athletics", "corporate"]);
const ALLOWED_STATUS = new Set(["draft", "active", "archived"]);

function normalizeChannel(value: string) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "sms") return "call_script";
  return v;
}

function normalizeTemplateType(value: string) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "sms_outreach") return "call_script";
  return v;
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, rows: [] }, { status: auth.status });
  }

  const { role, is_active } = await getRole(auth.user.id);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive", rows: [] }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden", rows: [] }, { status: 403 });
  }

  try {
    const url = new URL(req.url);

    const channel = normalizeChannel(url.searchParams.get("channel") || "");
    const templateType = normalizeTemplateType(url.searchParams.get("template_type") || "");
    const audienceStage = String(url.searchParams.get("audience_stage") || "").trim();
    const vertical = String(url.searchParams.get("vertical") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();

    if (channel && !ALLOWED_CHANNELS.has(channel)) {
      return NextResponse.json({ error: "Invalid channel", rows: [] }, { status: 400 });
    }

    if (templateType && !ALLOWED_TEMPLATE_TYPES.has(templateType)) {
      return NextResponse.json({ error: "Invalid template_type", rows: [] }, { status: 400 });
    }

    if (audienceStage && !ALLOWED_AUDIENCE_STAGES.has(audienceStage)) {
      return NextResponse.json({ error: "Invalid audience_stage", rows: [] }, { status: 400 });
    }

    if (vertical && !ALLOWED_VERTICALS.has(vertical)) {
      return NextResponse.json({ error: "Invalid vertical", rows: [] }, { status: 400 });
    }

    if (status && !ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ error: "Invalid status", rows: [] }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("message_templates")
      .select(`
        id,
        name,
        template_key,
        status,
        channel,
        template_type,
        template_scope,
        audience_stage,
        vertical,
        product_tree_family,
        product_tree_category,
        product_tree_subcategory,
        product_tree_item,
        subject_template,
        body_template,
        call_to_action,
        updated_at
      `)
      .order("updated_at", { ascending: false, nullsFirst: false });

    if (channel) query = query.eq("channel", channel);
    if (templateType) query = query.eq("template_type", templateType);
    if (audienceStage) query = query.eq("audience_stage", audienceStage);
    if (vertical) query = query.eq("vertical", vertical);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rows: (data ?? []).map((row: any) => ({
        ...row,
        channel: row?.channel === "sms" ? "call_script" : row?.channel,
        template_type:
          row?.template_type === "sms_outreach" ? "call_script" : row?.template_type,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "Failed to load templates",
        rows: [],
      },
      { status: 500 }
    );
  }
}