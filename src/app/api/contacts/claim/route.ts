import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const contact_id = String(body.contact_id || "").trim();

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  const { data: contact, error: readErr } = await supabaseAdmin
    .from("contacts")
    .select("id, assigned_to_user_id")
    .eq("id", contact_id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (contact.assigned_to_user_id && contact.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Contact already assigned" }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from("contacts")
    .update({
      assigned_to_user_id: me,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}