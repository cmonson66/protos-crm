import { NextResponse } from "next/server";
import {
  requireUser,
  getRole,
  canEditContact,
  type ContactAccessRecord,
} from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set([
  "New",
  "Secured/Active",
  "Closed/Do Not Contact",
]);

type ContactStatusAccessRecord = ContactAccessRecord & {
  id: string;
  status: string | null;
};

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const actorUserId = auth.user.id;
    const roleResult = await getRole(actorUserId);

    if (!roleResult.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

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
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, owner_user_id, assigned_to_user_id, status")
      .eq("id", contact_id)
      .maybeSingle<ContactStatusAccessRecord>();

    if (contactErr) {
      return NextResponse.json(
        { error: contactErr.message },
        { status: 500 }
      );
    }

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const allowed = canEditContact(roleResult.role, actorUserId, contact);

    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to update this contact" },
        { status: 403 }
      );
    }

const { data, error } = await supabaseAdmin.rpc("contact_set_status", {
  p_contact_id: contact_id,
  p_status: status,
  p_actor_user_id: actorUserId,
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
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}