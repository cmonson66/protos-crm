import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Vertical = "athletics" | "corporate";

function normalizeVertical(value: unknown): Vertical {
  return value === "corporate" ? "corporate" : "athletics";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (userErr || !userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: meProfile, error: profErr } = await supabase
      .from("user_profiles")
      .select("is_admin, role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    if (!meProfile?.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const role =
      !!meProfile?.is_admin || meProfile?.role === "admin"
        ? "admin"
        : meProfile?.role === "manager"
          ? "manager"
          : "rep";

    let visibleUserIds = [userId];

    if (role === "manager") {
      const { data: scopedUsers, error: scopeErr } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("is_active", true)
        .eq("manager_user_id", userId);

      if (scopeErr) {
        return NextResponse.json({ error: scopeErr.message }, { status: 400 });
      }

      visibleUserIds = Array.from(
        new Set([userId, ...(scopedUsers ?? []).map((r) => String(r.user_id))])
      );
    } else if (role === "admin") {
      const { data: scopedUsers, error: scopeErr } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("is_active", true);

      if (scopeErr) {
        return NextResponse.json({ error: scopeErr.message }, { status: 400 });
      }

      visibleUserIds = Array.from(
        new Set([userId, ...(scopedUsers ?? []).map((r) => String(r.user_id))])
      );
    }

    const { data: rowsRaw, error: rowsErr } = await supabase.rpc("contact_priority_scores_v2");

    if (rowsErr) {
      return NextResponse.json({ error: rowsErr.message }, { status: 400 });
    }

    let rows = (rowsRaw ?? []) as any[];

    if (role !== "admin") {
      rows = rows.filter((r) => visibleUserIds.includes(String(r.assigned_to_user_id || "")));
    }

    rows = rows.filter((r) => (r.status || "") !== "Closed/Do Not Contact");

    const ranked = rows
      .map((r) => ({
        id: r.id,
        vertical: normalizeVertical(r.vertical),
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        primary_email: r.primary_email ?? null,
        sport: r.sport ?? "",
        status: r.status ?? null,
        cadence_status: r.cadence_status ?? null,
        cadence_step: Number(r.cadence_step || 0),
        school_name: r.school_name ?? null,
        account_name: r.account_name ?? null,
        org_name: (r.org_name || r.account_name || r.school_name || null) as string | null,
        assigned_to_user_id: r.assigned_to_user_id ?? null,
        last_activity_at: r.last_activity_at ?? null,
        updated_at: r.updated_at ?? null,
        school_tier: r.school_tier ?? null,
        priority_score: Number(r.priority_score || 0),
        momentum_label: r.momentum_label ?? "Cold",
        momentum_score: Number(r.momentum_score || 0),
        priority_reason: r.priority_reason ?? "",
      }))
      .sort((a, b) => {
        if (b.priority_score !== a.priority_score) {
          return b.priority_score - a.priority_score;
        }
        return b.momentum_score - a.momentum_score;
      })
      .slice(0, limit);

    return NextResponse.json({
      data: ranked,
      count: ranked.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}