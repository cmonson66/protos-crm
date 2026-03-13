import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const url = new URL(req.url);
  const periodType = String(url.searchParams.get("period_type") || "monthly").trim();
  const periodKey = String(url.searchParams.get("period_key") || "").trim();

  if (!periodKey) {
    return NextResponse.json({ error: "period_key is required" }, { status: 400 });
  }

  if (!["weekly", "monthly"].includes(periodType)) {
    return NextResponse.json({ error: "Invalid period_type" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_leaderboard_entries")
    .select(`
      id,
      period_type,
      period_key,
      rep_user_id,
      rep_name,
      metric_sales,
      metric_revenue,
      metric_calls,
      metric_meetings,
      metric_conversions,
      rank_override,
      notes,
      updated_at
    `)
    .eq("period_type", periodType)
    .eq("period_key", periodKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).slice().sort((a: any, b: any) => {
    const aOverride = a.rank_override ?? Number.MAX_SAFE_INTEGER;
    const bOverride = b.rank_override ?? Number.MAX_SAFE_INTEGER;

    if (aOverride !== bOverride) return aOverride - bOverride;
    if (Number(b.metric_sales || 0) !== Number(a.metric_sales || 0)) {
      return Number(b.metric_sales || 0) - Number(a.metric_sales || 0);
    }
    if (Number(b.metric_revenue || 0) !== Number(a.metric_revenue || 0)) {
      return Number(b.metric_revenue || 0) - Number(a.metric_revenue || 0);
    }
    if (Number(b.metric_conversions || 0) !== Number(a.metric_conversions || 0)) {
      return Number(b.metric_conversions || 0) - Number(a.metric_conversions || 0);
    }
    return String(a.rep_name || "").localeCompare(String(b.rep_name || ""));
  });

  return NextResponse.json({ data: rows });
}