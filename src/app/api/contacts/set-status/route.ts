import { NextResponse } from "next/server";
import { requireUser, getRole, canEditContact } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set([
  "New",
  "Secured/Active",
  "Closed/Do Not Contact",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const contact_id = String(body?.contact_id || "").trim();
    const status = String(body?.status || "").trim();

    if (!contact_id || !status) {
      return NextResponse.json(
        { error: "contact_id and status are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const user = await requireUser(req);
    const actorUserId = user.id;
    const role = await getRole(actorUserId);

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, owner_user_id, assigned_to_user_id, status")
      .eq("id", contact_id)
      .maybeSingle();

    if (contactErr) {
      return NextResponse.json(
        { error: contactErr.message },
        { status: 400 }
      );
    }

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const allowed = canEditContact(role, actorUserId, contact);

    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to update this contact" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("contact_set_status", {
      p_contact_id: contact_id,
      p_status: status,
    });

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details ?? null,
          hint: error.hint ?? null,
          code: error.code ?? null,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? null });
  } catch (e: any) {
    const message = e?.message || "Server error";
    const status =
      message === "Not authenticated" || message === "Invalid session" ? 401 : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}