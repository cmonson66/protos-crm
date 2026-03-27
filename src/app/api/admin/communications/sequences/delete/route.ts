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
    const sequenceId = clean(body.sequence_id);

    if (!sequenceId) {
      return NextResponse.json({ error: "sequence_id is required" }, { status: 400 });
    }

    const { data: existingSteps, error: stepsReadErr } = await supabaseAdmin
      .from("communication_sequence_steps")
      .select("id, template_id")
      .eq("sequence_id", sequenceId);

    if (stepsReadErr) {
      return NextResponse.json({ error: stepsReadErr.message }, { status: 500 });
    }

    const templateIds = (existingSteps || [])
      .map((row) => row.template_id)
      .filter(Boolean) as string[];

    const { error: deleteStepsErr } = await supabaseAdmin
      .from("communication_sequence_steps")
      .delete()
      .eq("sequence_id", sequenceId);

    if (deleteStepsErr) {
      return NextResponse.json({ error: deleteStepsErr.message }, { status: 500 });
    }

    if (templateIds.length) {
      const { error: deleteTemplatesErr } = await supabaseAdmin
        .from("message_templates")
        .delete()
        .in("id", templateIds);

      if (deleteTemplatesErr) {
        return NextResponse.json({ error: deleteTemplatesErr.message }, { status: 500 });
      }
    }

    const { error: deleteSequenceErr } = await supabaseAdmin
      .from("communication_sequences")
      .delete()
      .eq("id", sequenceId);

    if (deleteSequenceErr) {
      return NextResponse.json({ error: deleteSequenceErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete cadence" },
      { status: 500 }
    );
  }
}