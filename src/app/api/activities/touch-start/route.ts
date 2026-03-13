import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Touch-spam guard:
 * - blocks starting a new touch if an active (not ended) touch exists
 * - or if a touch was started in the last LOCK_MIN minutes
 */
const LOCK_MIN = 10;

export async function POST(req: Request) {
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
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userErr || !userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const contact_id = String(body?.contact_id || "").trim();

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    // 1) Block if there's an active touch already
    const { data: activeTouch, error: activeErr } = await supabase
      .from("activities")
      .select("id, started_at, occurred_at")
      .eq("user_id", userId)
      .eq("type", "touch")
      .is("ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeErr) {
      return NextResponse.json({ error: activeErr.message }, { status: 400 });
    }

    if (activeTouch?.id) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          reason: "active_touch_exists",
          activity_id: activeTouch.id,
        },
        { status: 409 }
      );
    }

    // 2) Block if a touch started in last LOCK_MIN minutes
    const lockSinceIso = new Date(Date.now() - LOCK_MIN * 60 * 1000).toISOString();

    const { data: recentTouch, error: recentErr } = await supabase
      .from("activities")
      .select("id, started_at, occurred_at")
      .eq("user_id", userId)
      .eq("type", "touch")
      .gte("occurred_at", lockSinceIso)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentErr) {
      return NextResponse.json({ error: recentErr.message }, { status: 400 });
    }

    if (recentTouch?.id) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          reason: "recent_touch_lockout",
          lock_minutes: LOCK_MIN,
          activity_id: recentTouch.id,
        },
        { status: 429 }
      );
    }

    const now = new Date().toISOString();

    // Create the touch session activity row
    const { data, error } = await supabase
      .from("activities")
      .insert({
        contact_id,
        user_id: userId,
        type: "touch",
        occurred_at: now,
        subject: "Touch session started",
        started_at: now,
        ended_at: null,
        duration_seconds: null,
      })
      .select(
        `
        id,
        contact_id,
        user_id,
        type,
        occurred_at,
        subject,
        started_at,
        ended_at,
        duration_seconds,
        created_at
      `
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, activity: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}