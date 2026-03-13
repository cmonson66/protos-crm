import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canAssignContact,
  getRole,
  isPrivileged,
  requireUser,
} from "@/lib/apiAuth";

export const runtime = "nodejs";

type BulkAction =
  | "assign"
  | "status"
  | "start_cadence"
  | "restart_cadence"
  | "stop_cadence";

type ContactVertical = "coaching" | "corporate";

const ALLOWED_ACTIONS: BulkAction[] = [
  "assign",
  "status",
  "start_cadence",
  "restart_cadence",
  "stop_cadence",
];

const ALLOWED_STATUSES = ["New", "Secured/Active", "Closed/Do Not Contact"] as const;

function isValidStatus(value: string): value is (typeof ALLOWED_STATUSES)[number] {
  return (ALLOWED_STATUSES as readonly string[]).includes(value);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function normalizeVertical(value: unknown): ContactVertical {
  return value === "corporate" ? "corporate" : "coaching";
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const roleResult = await getRole(me);
  const role = roleResult.role;
  const is_active = roleResult.is_active;

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const contact_ids = Array.isArray(body.contact_ids)
    ? [...new Set(body.contact_ids.map((x: unknown) => String(x || "").trim()).filter(Boolean))]
    : [];

  const action = String(body.action || "").trim() as BulkAction;

  if (!contact_ids.length) {
    return NextResponse.json({ error: "contact_ids required" }, { status: 400 });
  }

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: existingContacts, error: contactsLookupErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      vertical,
      status,
      assigned_to_user_id,
      owner_user_id,
      cadence_status,
      cadence_started_at
    `)
    .in("id", contact_ids);

  if (contactsLookupErr) {
    return NextResponse.json({ error: contactsLookupErr.message }, { status: 500 });
  }

  const foundIds = new Set((existingContacts ?? []).map((c) => c.id));
  const missingIds = contact_ids.filter((id) => !foundIds.has(id));

  if (!existingContacts?.length) {
    return NextResponse.json({ error: "No matching contacts found" }, { status: 404 });
  }

  if (action === "assign" && !canAssignContact(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "assign") {
    const assigned_to_user_id = body.assigned_to_user_id
      ? String(body.assigned_to_user_id).trim()
      : null;

    if (assigned_to_user_id) {
      const { data: targetUser, error: targetErr } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, is_active")
        .eq("user_id", assigned_to_user_id)
        .maybeSingle();

      if (targetErr) {
        return NextResponse.json({ error: targetErr.message }, { status: 500 });
      }

      if (!targetUser) {
        return NextResponse.json({ error: "Assigned user not found" }, { status: 400 });
      }

      if (!targetUser.is_active) {
        return NextResponse.json({ error: "Assigned user is inactive" }, { status: 400 });
      }
    }

    const nowIso = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({
        assigned_to_user_id,
        updated_at: nowIso,
      })
      .in("id", contact_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const activityRows = (existingContacts ?? []).map((contact) => ({
      contact_id: contact.id,
      user_id: me,
      type: "note",
      occurred_at: nowIso,
      subject: "Contact reassigned",
      body: assigned_to_user_id
        ? contact.assigned_to_user_id
          ? `Assignment changed from ${contact.assigned_to_user_id} to ${assigned_to_user_id}.`
          : `Assigned to user ${assigned_to_user_id}.`
        : contact.assigned_to_user_id
          ? `Contact unassigned from ${contact.assigned_to_user_id}.`
          : "Contact left unassigned.",
    }));

    if (activityRows.length) {
      await supabaseAdmin.from("activities").insert(activityRows);
    }

    return NextResponse.json({
      ok: true,
      message: `Updated assignment for ${existingContacts.length} contact(s).${
        missingIds.length ? ` Missing ${missingIds.length}.` : ""
      }`,
      updated: existingContacts.length,
      missing: missingIds.length,
    });
  }

  if (action === "status") {
    const status = String(body.status || "").trim();

    if (!status) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    if (!isValidStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    let changed = 0;

    for (const contact of existingContacts ?? []) {
      const { error } = await supabaseAdmin.rpc("contact_set_status", {
        p_contact_id: contact.id,
        p_status: status,
      });

      if (error) {
        return NextResponse.json(
          {
            error: `Failed status update for contact ${contact.id}: ${error.message}`,
            details: error.details ?? null,
            hint: error.hint ?? null,
            code: error.code ?? null,
          },
          { status: 400 }
        );
      }

      if ((contact.status ?? null) !== status) {
        changed += 1;
      }
    }

    const activityRows = (existingContacts ?? []).map((contact) => ({
      contact_id: contact.id,
      user_id: me,
      type: "note",
      occurred_at: nowIso,
      subject: "Status updated",
      body:
        (contact.status ?? null) !== status
          ? `Status changed from ${contact.status ?? "—"} to ${status} in bulk operation.`
          : `Status remained ${status} in bulk operation.`,
    }));

    if (activityRows.length) {
      await supabaseAdmin.from("activities").insert(activityRows);
    }

    return NextResponse.json({
      ok: true,
      message: `Updated status for ${existingContacts.length} contact(s). Changed ${changed}.${
        missingIds.length ? ` Missing ${missingIds.length}.` : ""
      }`,
      updated: existingContacts.length,
      changed,
      missing: missingIds.length,
    });
  }

  if (action === "stop_cadence") {
    const nowIso = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_status: "stopped",
        cadence_next_due_at: null,
        cadence_updated_at: nowIso,
        updated_at: nowIso,
      })
      .in("id", contact_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("tasks")
      .update({
        status: "closed",
        completed_at: nowIso,
      })
      .in("contact_id", contact_ids)
      .eq("kind", "cadence")
      .is("completed_at", null);

    const activityRows = (existingContacts ?? []).map((contact) => ({
      contact_id: contact.id,
      user_id: me,
      type: "cadence",
      occurred_at: nowIso,
      subject: "Cadence stopped",
      body: "Cadence stopped in bulk operation.",
    }));

    if (activityRows.length) {
      await supabaseAdmin.from("activities").insert(activityRows);
    }

    return NextResponse.json({
      ok: true,
      message: `Stopped cadence for ${existingContacts.length} contact(s).${
        missingIds.length ? ` Missing ${missingIds.length}.` : ""
      }`,
      updated: existingContacts.length,
      missing: missingIds.length,
    });
  }

  if (action === "start_cadence" || action === "restart_cadence") {
    const cadence_key = String(body.cadence_key || "").trim();

    if (!cadence_key) {
      return NextResponse.json({ error: "cadence_key required" }, { status: 400 });
    }

    const { data: step1, error: stepErr } = await supabaseAdmin
      .from("cadence_template_steps")
      .select(`
        cadence_key,
        step,
        subject,
        body,
        due_offset_days,
        required_contact_status,
        is_active,
        vertical
      `)
      .eq("cadence_key", cadence_key)
      .eq("step", 1)
      .eq("is_active", true)
      .maybeSingle();

    if (stepErr) {
      return NextResponse.json({ error: stepErr.message }, { status: 500 });
    }

    if (!step1) {
      return NextResponse.json({ error: "Cadence step 1 not found" }, { status: 400 });
    }

    const cadenceVertical = normalizeVertical(step1.vertical);

    const contactVerticalSet = new Set(
      (existingContacts ?? []).map((c) => normalizeVertical(c.vertical))
    );

    if (contactVerticalSet.size > 1) {
      return NextResponse.json(
        {
          error:
            "Selected contacts include both coaching and corporate records. Bulk cadence start/restart requires a single vertical at a time.",
        },
        { status: 400 }
      );
    }

    const selectedContactVertical = normalizeVertical(
      existingContacts?.[0]?.vertical
    );

    if (selectedContactVertical !== cadenceVertical) {
      return NextResponse.json(
        {
          error: `Cadence ${cadence_key} is ${cadenceVertical} and cannot be applied to ${selectedContactVertical} contacts.`,
        },
        { status: 400 }
      );
    }

    let started = 0;
    let restarted = 0;
    let skipped = 0;
    let skippedWrongStatus = 0;
    let skippedAlreadyActive = 0;
    let skippedWrongVertical = 0;

    for (const contact of existingContacts ?? []) {
      const contactVertical = normalizeVertical(contact.vertical);

      if (contactVertical !== cadenceVertical) {
        skipped += 1;
        skippedWrongVertical += 1;
        continue;
      }

      if (contact.status !== "New") {
        skipped += 1;
        skippedWrongStatus += 1;
        continue;
      }

      if (
        step1.required_contact_status &&
        String(step1.required_contact_status) !== String(contact.status)
      ) {
        skipped += 1;
        skippedWrongStatus += 1;
        continue;
      }

      if (action === "start_cadence" && contact.cadence_status === "active") {
        skipped += 1;
        skippedAlreadyActive += 1;
        continue;
      }

      const now = new Date();
      const dueAt = addDays(now, Number(step1.due_offset_days || 0));
      const nowIso = now.toISOString();
      const dueIso = dueAt.toISOString();

      if (action === "restart_cadence") {
        await supabaseAdmin
          .from("tasks")
          .update({
            status: "closed",
            completed_at: nowIso,
          })
          .eq("contact_id", contact.id)
          .eq("kind", "cadence")
          .eq("cadence_key", cadence_key)
          .is("completed_at", null);
      }

      const { error: upErr } = await supabaseAdmin
        .from("contacts")
        .update({
          cadence_key,
          cadence_step: 1,
          cadence_status: "active",
          cadence_started_at:
            action === "restart_cadence"
              ? nowIso
              : contact.cadence_started_at ?? nowIso,
          cadence_updated_at: nowIso,
          cadence_next_due_at: dueIso,
          updated_at: nowIso,
        })
        .eq("id", contact.id);

      if (upErr) {
        skipped += 1;
        continue;
      }

      const { error: taskErr } = await supabaseAdmin.from("tasks").insert({
        contact_id: contact.id,
        assigned_to_user_id: contact.assigned_to_user_id || me,
        owner_user_id: contact.owner_user_id || me,
        task_type: "email",
        due_at: dueIso,
        title: step1.subject,
        notes: step1.body,
        status: "open",
        kind: "cadence",
        cadence_key,
        cadence_step: 1,
      });

      if (taskErr && !taskErr.message.toLowerCase().includes("duplicate")) {
        skipped += 1;
        continue;
      }

      await supabaseAdmin.from("activities").insert({
        contact_id: contact.id,
        user_id: me,
        type: "cadence",
        occurred_at: nowIso,
        subject: action === "restart_cadence" ? "Cadence restarted" : "Cadence started",
        body:
          action === "restart_cadence"
            ? `Cadence ${cadence_key} restarted in bulk operation at step 1.`
            : `Cadence ${cadence_key} started in bulk operation at step 1.`,
      });

      if (action === "restart_cadence") {
        restarted += 1;
      } else {
        started += 1;
      }
    }

    const message =
      action === "restart_cadence"
        ? `Restarted cadence for ${restarted} contact(s). Skipped ${skipped}.${
            skippedWrongVertical ? ` Wrong vertical: ${skippedWrongVertical}.` : ""
          }${
            skippedWrongStatus ? ` Wrong status: ${skippedWrongStatus}.` : ""
          }${
            skippedAlreadyActive ? ` Already active: ${skippedAlreadyActive}.` : ""
          }${missingIds.length ? ` Missing ${missingIds.length}.` : ""}`
        : `Started cadence for ${started} contact(s). Skipped ${skipped}.${
            skippedWrongVertical ? ` Wrong vertical: ${skippedWrongVertical}.` : ""
          }${
            skippedWrongStatus ? ` Wrong status: ${skippedWrongStatus}.` : ""
          }${
            skippedAlreadyActive ? ` Already active: ${skippedAlreadyActive}.` : ""
          }${missingIds.length ? ` Missing ${missingIds.length}.` : ""}`;

    return NextResponse.json({
      ok: true,
      message,
      started,
      restarted,
      skipped,
      skipped_wrong_vertical: skippedWrongVertical,
      skipped_wrong_status: skippedWrongStatus,
      skipped_already_active: skippedAlreadyActive,
      missing: missingIds.length,
      cadence_vertical: cadenceVertical,
      contact_vertical: selectedContactVertical,
    });
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
}