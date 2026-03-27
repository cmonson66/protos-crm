import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { role, is_active } = await getRole(auth.user.id);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    const payload = {
      sequence_id: clean(body.sequence_id),
      step_number: Number(body.step_number || 0),
      channel: clean(body.channel),
      template_id: clean(body.template_id) || null,
      delay_days: Number(body.delay_days || 0),
      required_contact_status: clean(body.required_contact_status) || null,
      is_active: body.is_active !== false,
    };

    if (!payload.sequence_id || !payload.step_number || !payload.channel) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("communication_sequence_steps")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create step" },
      { status: 500 }
    );
  }
}