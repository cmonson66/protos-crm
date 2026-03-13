import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runCadenceAutopilot } from "@/lib/cadenceAutopilot";

export const runtime = "nodejs";

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
    const activity_id = String(body?.activity_id || "").trim();

    if (!activity_id) {
      return NextResponse.json({ error: "activity_id is required" }, { status: 400 });
    }

    const { data: row, error: readErr } = await supabase
      .from("activities")
      .select("id, user_id, started_at, ended_at, contact_id, type")
      .eq("id", activity_id)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 400 });
    }
    if (!row) {
      return NextResponse.json({ error: "Touch activity not found" }, { status: 404 });
    }
    if (row.user_id !== userId) {
      return NextResponse.json({ error: "Not authorized to stop this touch" }, { status: 403 });
    }
    if (row.type !== "touch") {
      return NextResponse.json({ error: "Not a touch activity" }, { status: 400 });
    }
    if (!row.started_at) {
      return NextResponse.json({ error: "Touch activity missing started_at" }, { status: 400 });
    }
    if (row.ended_at) {
      return NextResponse.json({ ok: true, already_stopped: true });
    }

    const started = new Date(row.started_at).getTime();
    const endedIso = new Date().toISOString();
    const ended = new Date(endedIso).getTime();
    const durationSeconds = Math.max(0, Math.round((ended - started) / 1000));

    const { data: updated, error: updErr } = await supabase
      .from("activities")
      .update({
        ended_at: endedIso,
        duration_seconds: durationSeconds,
        subject: "Touch session completed",
      })
      .eq("id", activity_id)
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

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    let autopilot: any = null;

    if (updated?.contact_id) {
      autopilot = await runCadenceAutopilot({
        contactId: updated.contact_id,
        actorUserId: userId,
        signal: "touch",
        note: `Touch session completed in ${durationSeconds}s`,
      });

      if (!autopilot.ok) {
        return NextResponse.json(
          {
            error: autopilot.error,
            context: "touch_stopped_but_autopilot_failed",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, activity: updated, autopilot });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}