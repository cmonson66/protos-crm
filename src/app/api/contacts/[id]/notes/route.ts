import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const params = await context.params;
  const contactId = String(params.id || "").trim();

  if (!contactId) {
    return NextResponse.json({ error: "Contact id required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const noteBody = String(body.body || "").trim();

  if (!noteBody) {
    return NextResponse.json({ error: "Note body required" }, { status: 400 });
  }

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("id, assigned_to_user_id, owner_user_id")
    .eq("id", contactId)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (
    !isPrivileged(role) &&
    contact.assigned_to_user_id !== me &&
    contact.owner_user_id !== me
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("activities")
    .insert({
      contact_id: contactId,
      user_id: me,
      type: "note",
      occurred_at: now,
      subject: "Quick note",
      body: noteBody,
    })
    .select(`
      id,
      body,
      occurred_at,
      created_at
    `)
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: touchErr } = await supabaseAdmin
    .from("contacts")
    .update({
      last_activity_at: now,
      updated_at: now,
    })
    .eq("id", contactId);

  if (touchErr) {
    return NextResponse.json({ error: touchErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    note: inserted
      ? {
          id: inserted.id,
          body: inserted.body ?? "",
          occurred_at: inserted.occurred_at,
          created_at: inserted.created_at ?? null,
        }
      : null,
  });
}