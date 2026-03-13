import { NextResponse } from "next/server";
import { getRole, isPrivileged, requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toIntegerOrNull(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

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

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const period_type = clean(body.period_type);
  const period_key = clean(body.period_key);
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!["weekly", "monthly"].includes(period_type)) {
    return NextResponse.json({ error: "Invalid period_type" }, { status: 400 });
  }

  if (!period_key) {
    return NextResponse.json({ error: "period_key is required" }, { status: 400 });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  const payload = rows.map((row: any) => {
    const rep_user_id = clean(row.rep_user_id);
    const rep_name = clean(row.rep_name);

    if (!rep_user_id || !rep_name) {
      throw new Error("Each row requires rep_user_id and rep_name");
    }

    return {
      period_type,
      period_key,
      rep_user_id,
      rep_name,
      metric_sales: toNumber(row.metric_sales),
      metric_revenue: toNumber(row.metric_revenue),
      metric_calls: toNumber(row.metric_calls),
      metric_meetings: toNumber(row.metric_meetings),
      metric_conversions: toNumber(row.metric_conversions),
      rank_override: toIntegerOrNull(row.rank_override),
      notes: clean(row.notes) || null,
      updated_at: nowIso,
      updated_by_user_id: me,
    };
  });

  try {
    const { error } = await supabaseAdmin
      .from("sales_leaderboard_entries")
      .upsert(payload, {
        onConflict: "period_type,period_key,rep_user_id",
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: payload.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upsert failed" }, { status: 400 });
  }
}