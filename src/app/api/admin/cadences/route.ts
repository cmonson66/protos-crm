import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type CadenceStepRow = {
  cadence_key: string;
  step: number;
  name: string | null;
  subject: string | null;
  body: string | null;
  due_offset_days: number | null;
  required_contact_status: string | null;
  is_active: boolean | null;
  vertical: "coaching" | "corporate" | null;
  updated_at: string | null;
};

export async function GET(req: Request) {
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

  const { data, error } = await supabaseAdmin
    .from("cadence_template_steps")
    .select(`
      cadence_key,
      step,
      name,
      subject,
      body,
      due_offset_days,
      required_contact_status,
      is_active,
      vertical,
      updated_at
    `)
    .order("vertical", { ascending: true })
    .order("cadence_key", { ascending: true })
    .order("step", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as CadenceStepRow[];

  const byCadence = new Map<
    string,
    {
      cadence_key: string;
      vertical: "coaching" | "corporate";
      total_steps: number;
      active_steps: number;
      first_subject: string | null;
      updated_hint: string | null;
    }
  >();

  for (const row of rows) {
    const existing = byCadence.get(row.cadence_key) ?? {
      cadence_key: row.cadence_key,
      vertical: row.vertical === "corporate" ? "corporate" : "coaching",
      total_steps: 0,
      active_steps: 0,
      first_subject: null,
      updated_hint: null,
    };

    existing.total_steps += 1;

    if (row.is_active) {
      existing.active_steps += 1;
    }

    if (row.step === 1 && row.subject) {
      existing.first_subject = row.subject;
    }

    if (row.updated_at) {
      if (
        !existing.updated_hint ||
        new Date(row.updated_at).getTime() >
          new Date(existing.updated_hint).getTime()
      ) {
        existing.updated_hint = row.updated_at;
      }
    }

    byCadence.set(row.cadence_key, existing);
  }

  const result = Array.from(byCadence.values()).sort((a, b) => {
    if (a.vertical !== b.vertical) {
      return a.vertical.localeCompare(b.vertical);
    }
    return a.cadence_key.localeCompare(b.cadence_key);
  });

  return NextResponse.json({ data: result });
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

  const cadence_key = String(body?.cadence_key || "").trim();

  if (!cadence_key) {
    return NextResponse.json({ error: "cadence_key is required" }, { status: 400 });
  }

  const cadenceVertical: "coaching" | "corporate" =
    body?.vertical === "corporate" ? "corporate" : "coaching";

  const displayName = String(body?.name || "").trim() || cadence_key;
  const nowIso = new Date().toISOString();

  const { data: existingTemplate, error: existingTemplateErr } = await supabaseAdmin
    .from("cadence_templates")
    .select("key")
    .eq("key", cadence_key)
    .maybeSingle();

  if (existingTemplateErr) {
    return NextResponse.json({ error: existingTemplateErr.message }, { status: 500 });
  }

  if (existingTemplate) {
    return NextResponse.json({ error: "Cadence key already exists" }, { status: 409 });
  }

  const { data: existingStep, error: existingStepErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .select("cadence_key")
    .eq("cadence_key", cadence_key)
    .limit(1);

  if (existingStepErr) {
    return NextResponse.json({ error: existingStepErr.message }, { status: 500 });
  }

  if ((existingStep ?? []).length > 0) {
    return NextResponse.json({ error: "Cadence key already exists" }, { status: 409 });
  }

  const { error: templateInsertErr } = await supabaseAdmin
    .from("cadence_templates")
    .insert({
      key: cadence_key,
      name: displayName,
      is_active: true,
      vertical: cadenceVertical,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (templateInsertErr) {
    return NextResponse.json({ error: templateInsertErr.message }, { status: 500 });
  }

  const { error: stepInsertErr } = await supabaseAdmin
    .from("cadence_template_steps")
    .insert({
      cadence_key,
      step: 1,
      channel: "email",
      name: "Step 1",
      subject: "",
      body: "",
      due_offset_days: 0,
      required_contact_status: "New",
      is_active: true,
      vertical: cadenceVertical,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (stepInsertErr) {
    await supabaseAdmin.from("cadence_templates").delete().eq("key", cadence_key);

    return NextResponse.json({ error: stepInsertErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("activities").insert({
    user_id: me,
    type: "system",
    occurred_at: nowIso,
    subject: "Cadence created",
    body: `Cadence ${cadence_key} created with step 1 for ${cadenceVertical}.`,
  });

  return NextResponse.json({
    ok: true,
    cadence_key,
  });
}