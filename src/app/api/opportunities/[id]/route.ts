import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function GET(_: Request, context: { params: Params }) {
  const auth = await requireUser(_);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const { id } = await context.params;

  let query = supabaseAdmin
    .from("v_opportunities_enriched")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  if (role === "rep" && data.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: history, error: historyErr } = await supabaseAdmin
    .from("opportunity_stage_history")
    .select("*")
    .eq("opportunity_id", id)
    .order("changed_at", { ascending: false });

  if (historyErr) {
    return NextResponse.json({ error: historyErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    history: history ?? [],
  });
}
