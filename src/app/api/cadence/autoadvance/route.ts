import { NextResponse } from "next/server";
import { getRole, isPrivileged, requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runCadenceAutopilot, type CadenceSignal } from "@/lib/cadenceAutopilot";

export const runtime = "nodejs";

const ALLOWED_SIGNALS: CadenceSignal[] = [
  "touch",
  "call",
  "email",
  "note",
  "meeting",
  "reply",
];

export async function POST(req: Request) {
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

  const contact_id = String(body?.contact_id || "").trim();
  const signalRaw = String(body?.signal || "").trim().toLowerCase() as CadenceSignal;
  const note = body?.note ? String(body.note) : null;

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  if (!ALLOWED_SIGNALS.includes(signalRaw)) {
    return NextResponse.json(
      { error: `signal must be one of: ${ALLOWED_SIGNALS.join(", ")}` },
      { status: 400 }
    );
  }

  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("id, assigned_to_user_id, owner_user_id")
    .eq("id", contact_id)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!isPrivileged(role) && contact.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runCadenceAutopilot({
    contactId: contact_id,
    actorUserId: me,
    signal: signalRaw,
    note,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result);
}