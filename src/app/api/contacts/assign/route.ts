import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canAssignContact, getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

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

  if (!canAssignContact(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const contact_id = String(body.contact_id || "").trim();
  const assigned_to_user_id = body.assigned_to_user_id
    ? String(body.assigned_to_user_id).trim()
    : null;

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  const { data: existingContact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("id, assigned_to_user_id")
    .eq("id", contact_id)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!existingContact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

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

  if ((existingContact.assigned_to_user_id ?? null) === assigned_to_user_id) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error } = await supabaseAdmin
    .from("contacts")
    .update({
      assigned_to_user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("activities").insert({
    contact_id,
    user_id: me,
    type: "note",
    occurred_at: new Date().toISOString(),
    subject: "Contact reassigned",
    body: assigned_to_user_id
      ? existingContact.assigned_to_user_id
        ? `Assignment changed from ${existingContact.assigned_to_user_id} to ${assigned_to_user_id}.`
        : `Assigned to user ${assigned_to_user_id}.`
      : `Contact unassigned from ${existingContact.assigned_to_user_id}.`,
  });

  return NextResponse.json({ ok: true });
}