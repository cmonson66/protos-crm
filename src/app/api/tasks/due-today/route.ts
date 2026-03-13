import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tz = (url.searchParams.get("tz") || "America/Phoenix").trim();

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
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    // Session check
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Active check (optional but consistent with your contacts route)
    const { data: meProfile, error: profErr } = await supabase
      .from("user_profiles")
      .select("is_active")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });
    if (!meProfile?.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    // ✅ Best: call the function (RPC)
    const { data, error } = await supabase.rpc("cadence_tasks_due_today", {
      p_tz: tz,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}