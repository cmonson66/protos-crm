import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type TemplateRow = {
  id: string;
  name: string;
  template_key: string | null;
  status: "draft" | "active" | "archived";
  channel: "email" | "linkedin" | "call_script" | "task";
  template_type:
    | "cadence"
    | "product_followup"
    | "linkedin_outreach"
    | "call_script";
  template_scope: string | null;
  audience_stage: "new" | "secured_active";
  vertical: "athletics" | "corporate" | "all";
  subject_template: string | null;
  updated_at: string | null;
};

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const vertical = (url.searchParams.get("vertical") || "").trim().toLowerCase();
  const audienceStage = (url.searchParams.get("audience_stage") || "")
    .trim()
    .toLowerCase();

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
      subject_template,
      updated_at
    `)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (vertical === "athletics" || vertical === "corporate") {
    query = query.in("vertical", [vertical, "all"]);
  }

  if (audienceStage === "new" || audienceStage === "secured_active") {
    query = query.eq("audience_stage", audienceStage);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: (data ?? []) as TemplateRow[],
  });
}