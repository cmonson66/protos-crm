import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function buildPromotionNotes(existingNotes: string | null, promotedAtIso: string) {
  const lines = String(existingNotes || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.toLowerCase().startsWith("queue_source=") &&
        !line.toLowerCase().startsWith("promoted_at=") &&
        line.toLowerCase() !== "promoted from priority radar."
    );

  return [
    "queue_source=radar_promotion",
    `promoted_at=${promotedAtIso}`,
    "Promoted from Priority Radar.",
    ...lines,
  ].join("\n");
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
    const contact_id = clean(body.contact_id);

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, assigned_to_user_id, owner_user_id, first_name, last_name")
      .eq("id", contact_id)
      .maybeSingle();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 400 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const assignee = contact.assigned_to_user_id || userId;
    const owner = contact.owner_user_id || userId;
    const nowIso = new Date().toISOString();

    const titleBase =
      `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Priority contact";

    const { data: existingOpenTask, error: existingErr } = await supabase
      .from("tasks")
      .select("id, notes, title")
      .eq("contact_id", contact_id)
      .eq("kind", "manual")
      .is("completed_at", null)
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 400 });
    }

    let taskId: string | null = null;
    const promotionNotes = buildPromotionNotes(existingOpenTask?.notes ?? null, nowIso);

    if (existingOpenTask?.id) {
      const { error: updateErr } = await supabase
        .from("tasks")
        .update({
          due_at: nowIso,
          status: "open",
          assigned_to_user_id: assignee,
          owner_user_id: owner,
          title: `Work Now: ${titleBase}`,
          notes: promotionNotes,
        })
        .eq("id", existingOpenTask.id);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
      }

      taskId = existingOpenTask.id;
    } else {
      const { data: insertedTask, error: insertErr } = await supabase
        .from("tasks")
        .insert({
          contact_id,
          assigned_to_user_id: assignee,
          owner_user_id: owner,
          task_type: "follow_up",
          due_at: nowIso,
          title: `Work Now: ${titleBase}`,
          notes: promotionNotes,
          status: "open",
          kind: "manual",
          cadence_key: null,
          cadence_step: null,
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      taskId = insertedTask.id;
    }

    await supabase.from("activities").insert({
      contact_id,
      user_id: userId,
      type: "note",
      occurred_at: nowIso,
      subject: "Priority Radar promotion",
      body: "Contact was promoted into the live work queue.",
      outcome: "promoted",
    });

    return NextResponse.json({
      ok: true,
      task_id: taskId,
      contact_id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}