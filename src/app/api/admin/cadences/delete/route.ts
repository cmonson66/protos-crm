import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

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

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const cadence_key = String(body?.cadence_key || "").trim();

  if (!cadence_key) {
    return NextResponse.json({ error: "cadence_key is required" }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .select("cadence_key")
    .eq("cadence_key", cadence_key)
    .limit(1);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (!existing || existing.length === 0) {
    return NextResponse.json({ error: "Cadence not found" }, { status: 404 });
  }

  const { error: deleteStepsErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .delete()
    .eq("cadence_key", cadence_key);

  if (deleteStepsErr) {
    return NextResponse.json({ error: deleteStepsErr.message }, { status: 500 });
  }

  const { error: deleteTemplateErr } = await supabaseAdmin
    .from("cadence_templates")
    .delete()
    .eq("key", cadence_key);

  if (deleteTemplateErr) {
    return NextResponse.json({ error: deleteTemplateErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("activities").insert({
    user_id: me,
    type: "system",
    occurred_at: new Date().toISOString(),
    subject: "Cadence deleted",
    body: `Cadence ${cadence_key} was deleted.`,
  });

  return NextResponse.json({ ok: true });
}