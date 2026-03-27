import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

function buildPromotionNotes(existingNotes?: string | null) {
  const parts = [String(existingNotes || "").trim()].filter(Boolean);
  const lower = parts.join("\n").toLowerCase();

  if (!lower.includes("queue_source=radar_promotion")) {
    parts.push("queue_source=radar_promotion");
  }

  if (!lower.includes("promoted from priority radar")) {
    parts.push("Promoted from Priority Radar.");
  }

  return parts.join("\n");
}

function stripRadarPromotionMarkers(notes?: string | null) {
  const cleaned = String(notes || "")
    .replace(/queue_source=radar_promotion/gi, "")
    .replace(/promoted from priority radar\.?/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return cleaned || null;
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const me = auth.user.id;
    const { role, is_active } = await getRole(me);

    if (!is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const contactId = String(body?.contact_id || "").trim();

    if (!contactId) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const isAdmin = role === "admin" || role === "manager";

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, assigned_to_user_id")
      .eq("id", contactId)
      .maybeSingle();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 400 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (!isAdmin && contact.assigned_to_user_id !== me) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const nowIso = new Date().toISOString();
    const fullName =
      `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Contact";

    const { data: allOpenAssignedTasks, error: assignedTasksErr } = await supabaseAdmin
      .from("tasks")
      .select("id, notes, title, contact_id")
      .eq("assigned_to_user_id", me)
      .is("completed_at", null);

    if (assignedTasksErr) {
      return NextResponse.json({ error: assignedTasksErr.message }, { status: 400 });
    }

    const previouslyPromotedTasks = (allOpenAssignedTasks ?? []).filter((task: any) => {
      const notes = String(task.notes || "").toLowerCase();
      const title = String(task.title || "").toLowerCase();

      return (
        notes.includes("queue_source=radar_promotion") ||
        notes.includes("promoted from priority radar") ||
        title.startsWith("work now:")
      );
    });

    for (const task of previouslyPromotedTasks) {
      const cleanedNotes = stripRadarPromotionMarkers(task.notes);

      const nextTitle = String(task.title || "").toLowerCase().startsWith("work now:")
        ? null
        : task.title ?? null;

      const updatePayload: Record<string, any> = {
        notes: cleanedNotes,
        updated_at: nowIso,
      };

      if (nextTitle === null) {
        updatePayload.title = null;
      }

      const { error: clearErr } = await supabaseAdmin
        .from("tasks")
        .update(updatePayload)
        .eq("id", task.id);

      if (clearErr) {
        return NextResponse.json({ error: clearErr.message }, { status: 400 });
      }
    }

    const { data: existingOpenTasks, error: existingErr } = await supabaseAdmin
      .from("tasks")
      .select(`
        id,
        title,
        notes,
        kind,
        task_type,
        due_at,
        assigned_to_user_id,
        owner_user_id
      `)
      .eq("contact_id", contactId)
      .is("completed_at", null)
      .order("due_at", { ascending: true });

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 400 });
    }

    const existing = (existingOpenTasks ?? [])[0] as
      | {
          id: string;
          title: string | null;
          notes: string | null;
          kind: string;
          task_type: string;
          due_at: string | null;
          assigned_to_user_id: string | null;
          owner_user_id: string | null;
        }
      | undefined;

    const alreadyPromoted =
      !!existing &&
      (String(existing.title || "").toLowerCase().startsWith("work now:") ||
        String(existing.notes || "").toLowerCase().includes("queue_source=radar_promotion"));

    if (alreadyPromoted) {
      return NextResponse.json({
        ok: true,
        task_id: existing.id,
        contact_id: contactId,
        already_promoted: true,
      });
    }

    let promotedTaskId: string | null = null;

    if (existing?.id) {
      const nextTitle = `Work Now: ${fullName}`;
      const nextNotes = buildPromotionNotes(existing.notes);

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("tasks")
        .update({
          title: nextTitle,
          notes: nextNotes,
          due_at: nowIso,
          assigned_to_user_id: me,
          owner_user_id: existing.owner_user_id ?? me,
          status: "open",
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
      }

      promotedTaskId = updated.id;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("tasks")
        .insert({
          contact_id: contactId,
          title: `Work Now: ${fullName}`,
          notes: buildPromotionNotes(null),
          task_type: "manual_follow_up",
          kind: "manual",
          due_at: nowIso,
          assigned_to_user_id: me,
          owner_user_id: me,
          status: "open",
        })
        .select("id")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      promotedTaskId = inserted.id;
    }

    const { error: activityErr } = await supabaseAdmin.from("activities").insert({
      contact_id: contactId,
      user_id: me,
      type: "note",
      occurred_at: nowIso,
      subject: "Queue Promotion",
      body: "Promoted from Priority Radar into live work queue.",
      outcome: "queue_promote",
    });

    if (activityErr) {
      return NextResponse.json({ error: activityErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      task_id: promotedTaskId,
      contact_id: contactId,
      already_promoted: false,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}