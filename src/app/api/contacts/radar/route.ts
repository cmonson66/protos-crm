import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreContact } from "@/lib/priorityEngine";

export const runtime = "nodejs";

type Vertical = "coaching" | "corporate";

function normalizeVertical(value: unknown): Vertical {
  return value === "corporate" ? "corporate" : "coaching";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit") || 20))
    );

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

    const isPrivileged =
      !!meProfile?.is_admin ||
      meProfile?.role === "admin" ||
      meProfile?.role === "manager";

    const { data: cpsData, error: cpsErr } = await supabase.rpc("contact_priority_scores");

    if (cpsErr) {
      return NextResponse.json({ error: cpsErr.message }, { status: 400 });
    }

    let rows = (cpsData ?? []) as any[];

    if (!isPrivileged) {
      rows = rows.filter((r) => r.assigned_to_user_id === userId);
    }

    rows = rows.filter((r) => (r.status || "") !== "Closed/Do Not Contact");

    const ranked = rows
      .map((r) => {
        const vertical = normalizeVertical(r.vertical);

        const scored = scoreContact({
          vertical,
          status: r.status ?? null,
          cadence_status: r.cadence_status ?? null,
          cadence_step: Number(r.cadence_step || 0),
          last_activity_at: r.last_activity_at ?? null,
          updated_at: r.updated_at ?? null,
          cadence_next_due_at: r.cadence_next_due_at ?? null,
          school_tier: r.school_tier ?? null,
          account_tier: null,
          role_seniority: r.role_seniority ?? r.job_title_raw ?? null,
          market_segment: r.market_segment ?? null,
          buying_intent: r.buying_intent ?? null,
          company_size: r.company_size ?? null,
          existing_score: Number(r.score || 0),
        });

        return {
          id: r.id,
          vertical,
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
          priority_score: scored.priority_score,
          momentum_label: scored.momentum_label,
          momentum_score: scored.momentum_score,
          priority_reason: scored.priority_reason,
        };
      })
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