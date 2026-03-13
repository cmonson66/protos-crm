import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const tz = (url.searchParams.get("tz") || "America/Phoenix").trim();
    const dueSoonDays = Math.max(1, Number(url.searchParams.get("dueSoonDays") || 3));

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
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // optional: active check
    const { data: meProfile, error: profErr } = await supabase
      .from("user_profiles")
      .select("is_active")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });
    if (!meProfile?.is_active) return NextResponse.json({ error: "User inactive" }, { status: 403 });

    const { data, error } = await supabase.rpc("dashboard_task_kpis", {
      p_tz: tz,
      p_due_soon_days: dueSoonDays,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data: data?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}