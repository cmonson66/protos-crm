import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getManagerScopeUserIds, getRole } from "@/lib/apiAuth";

export const runtime = "nodejs";

function getQuarterStart(d: Date) {
  const month = d.getUTCMonth();
  const quarterMonth = Math.floor(month / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), quarterMonth, 1, 0, 0, 0));
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const url = new URL(req.url);
  const vertical = String(url.searchParams.get("vertical") || "").trim() || null;
  const rep_user_id = String(url.searchParams.get("rep_user_id") || "").trim() || null;

  const scopeUserIds = await getManagerScopeUserIds(me, role);

  let assignedFilter: string | null = null;

  if (role === "rep") {
    assignedFilter = me;
  } else if (role === "manager") {
    if (rep_user_id) {
      if (!scopeUserIds.includes(rep_user_id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      assignedFilter = rep_user_id;
    } else {
      assignedFilter = null;
    }
  } else {
    assignedFilter = rep_user_id;
  }

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
  const quarterStart = getQuarterStart(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  const [ytd, qtr, mth, conversions, velocity] = await Promise.all([
    supabaseAdmin.rpc("dashboard_opportunity_revenue_summary", {
      p_start: yearStart.toISOString(),
      p_end: now.toISOString(),
      p_vertical: vertical,
      p_assigned_to_user_id: assignedFilter,
    }),
    supabaseAdmin.rpc("dashboard_opportunity_revenue_summary", {
      p_start: quarterStart.toISOString(),
      p_end: now.toISOString(),
      p_vertical: vertical,
      p_assigned_to_user_id: assignedFilter,
    }),
    supabaseAdmin.rpc("dashboard_opportunity_revenue_summary", {
      p_start: monthStart.toISOString(),
      p_end: now.toISOString(),
      p_vertical: vertical,
      p_assigned_to_user_id: assignedFilter,
    }),
    supabaseAdmin.rpc("dashboard_stage_conversions", {
      p_start: yearStart.toISOString(),
      p_end: now.toISOString(),
      p_vertical: vertical,
      p_assigned_to_user_id: assignedFilter,
    }),
    supabaseAdmin.rpc("dashboard_sales_velocity", {
      p_start: yearStart.toISOString(),
      p_end: now.toISOString(),
      p_vertical: vertical,
    }),
  ]);

  if (ytd.error) return NextResponse.json({ error: ytd.error.message }, { status: 500 });
  if (qtr.error) return NextResponse.json({ error: qtr.error.message }, { status: 500 });
  if (mth.error) return NextResponse.json({ error: mth.error.message }, { status: 500 });
  if (conversions.error) return NextResponse.json({ error: conversions.error.message }, { status: 500 });
  if (velocity.error) return NextResponse.json({ error: velocity.error.message }, { status: 500 });

  return NextResponse.json({
    data: {
      ytd: ytd.data?.[0] ?? null,
      quarter: qtr.data?.[0] ?? null,
      month: mth.data?.[0] ?? null,
      conversions: conversions.data?.[0] ?? null,
      sales_velocity: velocity.data?.[0] ?? null,
    },
  });
}