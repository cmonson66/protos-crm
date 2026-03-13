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
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userErr || !userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const contact_id = String(body?.contact_id || "").trim();
    const subject = body?.subject ? String(body.subject) : null;
    const email_body = body?.body ? String(body.body) : null;
    const complete_task_id = body?.complete_task_id
      ? String(body.complete_task_id)
      : null;

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const { error } = await supabase.rpc("log_email_sent", {
      p_contact_id: contact_id,
      p_actor_user_id: userId,
      p_subject: subject,
      p_body: email_body,
      p_complete_task_id: complete_task_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const autopilot = await runCadenceAutopilot({
      contactId: contact_id,
      actorUserId: userId,
      signal: "email",
      note: subject || email_body || null,
    });

    if (!autopilot.ok) {
      return NextResponse.json(
        {
          error: autopilot.error,
          guard: autopilot.guard ?? null,
          context: "email_logged_but_autopilot_failed",
        },
        { status: 500 }
      );
    }

    if (autopilot.action === "noop") {
      return NextResponse.json(
        {
          error: autopilot.reason,
          guard: autopilot.guard ?? null,
          context: "email_logged_but_noop",
          autopilot,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, autopilot });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}