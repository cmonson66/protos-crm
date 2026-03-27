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

    const { data: stepRows, error: stepReadErr } = await supabaseAdmin
      .from("communication_sequence_steps")
      .select("template_id")
      .eq("sequence_id", sequenceId);

    if (stepReadErr) {
      return NextResponse.json({ error: stepReadErr.message }, { status: 500 });
    }

    const templateIds = (stepRows || [])
      .map((row) => row.template_id)
      .filter(Boolean) as string[];

    const { error: sequenceErr } = await supabaseAdmin
      .from("communication_sequences")
      .update({
        status: "archived",
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sequenceId);

    if (sequenceErr) {
      return NextResponse.json({ error: sequenceErr.message }, { status: 500 });
    }

    if (templateIds.length) {
      const { error: templateErr } = await supabaseAdmin
        .from("message_templates")
        .update({
          status: "archived",
          updated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", templateIds);

      if (templateErr) {
        return NextResponse.json({ error: templateErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to archive cadence" },
      { status: 500 }
    );
  }
}