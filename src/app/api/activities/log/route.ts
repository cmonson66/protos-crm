import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runCadenceAutopilot, type CadenceSignal } from "@/lib/cadenceAutopilot";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logContactMessage } from "@/lib/messaging/service";

export const runtime = "nodejs";

function mapActivityTypeToSignal(
  type: string,
  outcome?: string | null
): CadenceSignal | null {
  const t = String(type || "").trim().toLowerCase();
  const o = String(outcome || "").trim().toLowerCase();

  if (o === "reply" || o === "replied" || o === "reply_detected") return "reply";

  if (t === "reply") return "reply";
  if (t === "call") return "call";
  if (t === "call_script") return "call";
  if (t === "email") return "email";
  if (t === "linkedin") return "linkedin";
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
    const template_id = body.template_id ? String(body.template_id).trim() : null;
    const auto_advance_cadence = Boolean(body.auto_advance_cadence);

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

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, cadence_key, cadence_step, cadence_status")
      .eq("id", contact_id)
      .maybeSingle();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 400 });
    }

    if (template_id) {
      const normalizedChannel =
        type === "call_script"
          ? "call_script"
          : type === "linkedin"
            ? "linkedin"
            : type === "email"
              ? "email"
              : type === "call"
                ? "call_script"
                : "task";

      await logContactMessage({
        contact_id,
        template_id,
        cadence_key: contact?.cadence_key ?? null,
        cadence_step:
          contact?.cadence_status === "active"
            ? Number(contact?.cadence_step ?? 0) || null
            : null,
        channel: normalizedChannel as any,
        subject_rendered: subject,
        body_rendered: bodyText || "",
        delivery_status: "logged",
        sent_by: userId,
      });
    }

    const signal = mapActivityTypeToSignal(type, outcome);

    let autopilot: any = null;

    if (signal && auto_advance_cadence) {
      autopilot = await runCadenceAutopilot({
        contactId: contact_id,
        actorUserId: userId,
        signal,
        note: subject || bodyText || null,
      });

      if (!autopilot?.ok) {
        return NextResponse.json(
          {
            ok: true,
            data: inserted,
            autopilot,
            warning: autopilot?.error || "Autopilot failed after activity logged",
            context: "activity_logged_but_autopilot_failed",
          },
          { status: 200 }
        );
      }

      if (autopilot?.action === "noop") {
        return NextResponse.json(
          {
            ok: true,
            data: inserted,
            autopilot,
            warning: autopilot?.reason || "No cadence advance performed",
            context: "activity_logged_but_noop",
          },
          { status: 200 }
        );
      }
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