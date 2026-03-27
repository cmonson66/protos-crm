import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getManagerScopeUserIds, getRole } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
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
      .select("is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    if (!meProfile?.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const { role } = await getRole(userId);
    const scopeUserIds = await getManagerScopeUserIds(userId, role);

    const { data, error } = await supabase.rpc("dashboard_activity_heatmap_scoped", {
      p_user_ids: scopeUserIds,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}