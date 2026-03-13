import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runCadenceAutopilot, type CadenceSignal } from "@/lib/cadenceAutopilot";

export const runtime = "nodejs";

function mapActivityTypeToSignal(type: string, outcome?: string | null): CadenceSignal | null {
  const t = String(type || "").trim().toLowerCase();
  const o = String(outcome || "").trim().toLowerCase();

  if (o === "reply" || o === "replied" || o === "reply_detected") return "reply";

  if (t === "reply") return "reply";
  if (t === "call") return "call";
  if (t === "email") return "email";
  if (t === "meeting") return "meeting";
  if (t === "note") return "note";
  if (t === "touch") return "touch";

  return null;
}

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

    const body = await req.json().catch(() => ({}));

    const contact_id = String(body.contact_id || "").trim();
    const type = String(body.type || "note").trim();
    const subject = body.subject ? String(body.subject).trim() : null;
    const bodyText = body.body ? String(body.body).trim() : null;
    const outcome = body.outcome ? String(body.outcome).trim() : null;

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const occurredAt = new Date().toISOString();

    const { data: inserted, error } = await supabase
      .from("activities")
      .insert({
        contact_id,
        user_id: userId,
        type,
        occurred_at: occurredAt,
        subject,
        body: bodyText,
        outcome,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const signal = mapActivityTypeToSignal(type, outcome);

    let autopilot: any = null;

    if (signal) {
      autopilot = await runCadenceAutopilot({
        contactId: contact_id,
        actorUserId: userId,
        signal,
        note: subject || bodyText || null,
      });
    }

    return NextResponse.json({
      ok: true,
      data: inserted,
      autopilot,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}