import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getManagerScopeUserIds, getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type PeriodType = "weekly" | "monthly";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseMonthlyPeriod(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) return null;

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

function isoWeekStart(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

function parseWeeklyPeriod(periodKey: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);

  if (week < 1 || week > 53) return null;

  const start = isoWeekStart(year, week);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return { start, end };
}

function parsePeriod(periodType: PeriodType, periodKey: string) {
  return periodType === "monthly"
    ? parseMonthlyPeriod(periodKey)
    : parseWeeklyPeriod(periodKey);
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
  const periodType = (clean(url.searchParams.get("period_type")) || "monthly") as PeriodType;
  const periodKey = clean(url.searchParams.get("period_key"));

  if (periodType !== "weekly" && periodType !== "monthly") {
    return NextResponse.json({ error: "Invalid period_type" }, { status: 400 });
  }

  if (!periodKey) {
    return NextResponse.json({ error: "period_key is required" }, { status: 400 });
  }

  const period = parsePeriod(periodType, periodKey);
  if (!period) {
    return NextResponse.json({ error: "Invalid period_key format" }, { status: 400 });
  }

  const startIso = period.start.toISOString();
  const endIso = period.end.toISOString();

  const scopeUserIds = await getManagerScopeUserIds(me, role);

  const { data: repRows, error: repErr } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, full_name, email, role, is_active")
    .in("user_id", scopeUserIds)
    .eq("is_active", true);

  if (repErr) {
    return NextResponse.json({ error: repErr.message }, { status: 500 });
  }

  const reps = (repRows ?? []) as Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean;
  }>;

  if (reps.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const repIds = reps.map((r) => r.user_id);

  const [activitiesRes, meetingsRes, salesRes, commissionsRes] = await Promise.all([
    supabaseAdmin
      .from("activities")
      .select("user_id, type, outcome, occurred_at")
      .in("user_id", repIds)
      .gte("occurred_at", startIso)
      .lt("occurred_at", endIso),

    supabaseAdmin
      .from("opportunities")
      .select("assigned_to_user_id, qualified_meeting_booked_at")
      .in("assigned_to_user_id", repIds)
      .gte("qualified_meeting_booked_at", startIso)
      .lt("qualified_meeting_booked_at", endIso),

    supabaseAdmin
      .from("opportunities")
      .select("assigned_to_user_id, actual_revenue, closed_won_at, status")
      .in("assigned_to_user_id", repIds)
      .eq("status", "closed_won")
      .gte("closed_won_at", startIso)
      .lt("closed_won_at", endIso),

    supabaseAdmin
      .from("opportunities")
      .select("assigned_to_user_id, commission_paid_rep, commission_paid_at")
      .in("assigned_to_user_id", repIds)
      .gt("commission_paid_rep", 0)
      .gte("commission_paid_at", startIso)
      .lt("commission_paid_at", endIso),
  ]);

  if (activitiesRes.error) {
    return NextResponse.json({ error: activitiesRes.error.message }, { status: 500 });
  }
  if (meetingsRes.error) {
    return NextResponse.json({ error: meetingsRes.error.message }, { status: 500 });
  }
  if (salesRes.error) {
    return NextResponse.json({ error: salesRes.error.message }, { status: 500 });
  }
  if (commissionsRes.error) {
    return NextResponse.json({ error: commissionsRes.error.message }, { status: 500 });
  }

  const activityMap = new Map<
    string,
    {
      calls: number;
      emails: number;
      linkedin: number;
      meetings: number;
      conversions: number;
    }
  >();

  const salesMap = new Map<
    string,
    {
      sales: number;
      revenue: number;
    }
  >();

  const meetingsMap = new Map<string, number>();
  const commissionsMap = new Map<string, number>();

  for (const repId of repIds) {
    activityMap.set(repId, {
      calls: 0,
      emails: 0,
      linkedin: 0,
      meetings: 0,
      conversions: 0,
    });
    salesMap.set(repId, { sales: 0, revenue: 0 });
    meetingsMap.set(repId, 0);
    commissionsMap.set(repId, 0);
  }

  for (const row of activitiesRes.data ?? []) {
    const repId = String((row as any).user_id || "");
    if (!repId || !activityMap.has(repId)) continue;

    const bucket = activityMap.get(repId)!;
    const type = clean((row as any).type).toLowerCase();
    const outcome = clean((row as any).outcome).toLowerCase();

    if (type === "call") bucket.calls += 1;
    if (type === "email") bucket.emails += 1;
    if (type === "linkedin") bucket.linkedin += 1;
    if (type === "meeting") bucket.meetings += 1;

    if (outcome === "booked_demo" || outcome === "replied") {
      bucket.conversions += 1;
    }
  }

  for (const row of meetingsRes.data ?? []) {
    const repId = String((row as any).assigned_to_user_id || "");
    if (!repId || !meetingsMap.has(repId)) continue;
    meetingsMap.set(repId, (meetingsMap.get(repId) || 0) + 1);
  }

  for (const row of salesRes.data ?? []) {
    const repId = String((row as any).assigned_to_user_id || "");
    if (!repId || !salesMap.has(repId)) continue;

    const bucket = salesMap.get(repId)!;
    bucket.sales += 1;
    bucket.revenue += Number((row as any).actual_revenue || 0);
  }

  for (const row of commissionsRes.data ?? []) {
    const repId = String((row as any).assigned_to_user_id || "");
    if (!repId || !commissionsMap.has(repId)) continue;
    commissionsMap.set(
      repId,
      Number(commissionsMap.get(repId) || 0) + Number((row as any).commission_paid_rep || 0)
    );
  }

  const rows = reps.map((rep) => {
    const activity = activityMap.get(rep.user_id)!;
    const sales = salesMap.get(rep.user_id)!;
    const meetingsSet = meetingsMap.get(rep.user_id) || 0;
    const commissionsPaid = commissionsMap.get(rep.user_id) || 0;

    return {
      id: `${periodType}:${periodKey}:${rep.user_id}`,
      period_type: periodType,
      period_key: periodKey,
      rep_user_id: rep.user_id,
      rep_name: rep.full_name || rep.email || rep.user_id,
      metric_sales: sales.sales,
      metric_revenue: sales.revenue,
      metric_commissions_paid: commissionsPaid,
      metric_calls: activity.calls,
      metric_emails: activity.emails,
      metric_linkedin: activity.linkedin,
      metric_meetings: meetingsSet || activity.meetings,
      metric_conversions: activity.conversions,
      rank_override: null,
      notes: null,
      updated_at: new Date().toISOString(),
    };
  });

  return NextResponse.json({ data: rows });
}