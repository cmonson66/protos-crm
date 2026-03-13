import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabaseRoute";
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
  const supabase = await createRouteClient();
  const body = await req.json().catch(() => ({}));

  const contact_id = String(body.contact_id || "").trim();
  const type = String(body.type || "").trim();
  const subject = body.subject ? String(body.subject).trim() : null;
  const bodyText = body.body ? String(body.body).trim() : null;
  const outcome = body.outcome ? String(body.outcome).trim() : null;

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  if (!type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const occurredAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("activities")
    .insert({
      contact_id,
      user_id: user.id,
      type,
      occurred_at: occurredAt,
      subject: subject || null,
      body: bodyText || null,
      outcome: outcome || null,
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
      actorUserId: user.id,
      signal,
      note: subject || bodyText || null,
    });
  }

  return NextResponse.json({
    data,
    autopilot,
  });
}