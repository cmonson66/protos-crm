import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("message_templates")
    .select(`
      id,
      name,
      cadence_key,
      cadence_step,
      channel,
      template_type,
      status,
      subject_template,
      updated_at
    `)
    .order("cadence_key", { ascending: true })
    .order("cadence_step", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rows: data });
}