import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeVertical(value: unknown): "coaching" | "corporate" {
  return value === "corporate" ? "corporate" : "coaching";
}

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

  const source_cadence_key = clean(body?.source_cadence_key);
  const new_cadence_key = clean(body?.new_cadence_key);

  if (!source_cadence_key || !new_cadence_key) {
    return NextResponse.json(
      { error: "source_cadence_key and new_cadence_key are required" },
      { status: 400 }
    );
  }

  if (source_cadence_key === new_cadence_key) {
    return NextResponse.json(
      { error: "New cadence key must be different" },
      { status: 400 }
    );
  }

  const { data: exists, error: existsErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .select("cadence_key")
    .eq("cadence_key", new_cadence_key)
    .limit(1);

  if (existsErr) {
    return NextResponse.json({ error: existsErr.message }, { status: 500 });
  }

  if ((exists ?? []).length > 0) {
    return NextResponse.json(
      { error: "Target cadence key already exists" },
      { status: 400 }
    );
  }

  const { data: sourceTemplate, error: sourceTemplateErr } = await supabaseAdmin
    .from("cadence_templates")
    .select("key, name, is_active, vertical")
    .eq("key", source_cadence_key)
    .maybeSingle();

  if (sourceTemplateErr) {
    return NextResponse.json(
      { error: sourceTemplateErr.message },
      { status: 500 }
    );
  }

  const { data: sourceSteps, error: sourceErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .select(`
      step,
      name,
      subject,
      body,
      due_offset_days,
      required_contact_status,
      is_active,
      vertical
    `)
    .eq("cadence_key", source_cadence_key)
    .order("step", { ascending: true });

  if (sourceErr) {
    return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  }

  if (!sourceSteps || sourceSteps.length === 0) {
    return NextResponse.json(
      { error: "Source cadence not found" },
      { status: 404 }
    );
  }

  const vertical = normalizeVertical(
    sourceTemplate?.vertical ?? sourceSteps[0]?.vertical
  );

  const { error: templateUpsertErr } = await supabaseAdmin
    .from("cadence_templates")
    .upsert({
      key: new_cadence_key,
      name: sourceTemplate?.name
        ? `${sourceTemplate.name} Copy`
        : new_cadence_key,
      is_active: sourceTemplate?.is_active ?? true,
      vertical,
      updated_at: new Date().toISOString(),
    });

  if (templateUpsertErr) {
    return NextResponse.json(
      { error: templateUpsertErr.message },
      { status: 500 }
    );
  }

  const payload = sourceSteps.map((s: any) => ({
    cadence_key: new_cadence_key,
    step: s.step,
    name: s.name,
    subject: s.subject,
    body: s.body,
    due_offset_days: s.due_offset_days,
    required_contact_status: s.required_contact_status,
    is_active: s.is_active,
    vertical,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .insert(payload);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("activities").insert({
    user_id: me,
    type: "system",
    occurred_at: new Date().toISOString(),
    subject: "Cadence duplicated",
    body: `Cadence ${source_cadence_key} duplicated to ${new_cadence_key}. Vertical: ${vertical}.`,
  });

  return NextResponse.json({
    ok: true,
    cadence_key: new_cadence_key,
    vertical,
  });
}