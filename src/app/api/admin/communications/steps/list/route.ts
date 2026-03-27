import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const sequenceId = (url.searchParams.get("sequence_id") || "").trim();

  if (!sequenceId) {
    return NextResponse.json({ error: "sequence_id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("communication_sequence_steps")
    .select(`
      *,
      message_templates (
        id,
        name,
        template_key,
        status,
        channel,
        template_type,
        subject_template,
        body_template,
        call_to_action
      )
    `)
    .eq("sequence_id", sequenceId)
    .order("step_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}