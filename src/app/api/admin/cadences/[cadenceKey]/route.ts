import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

function normalizeTemplateText(s: string) {
  return (s || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function renderTemplate(
  s: string,
  vars: Record<string, string | null | undefined>
) {
  let out = normalizeTemplateText(s);

  for (const [k, v] of Object.entries(vars)) {
    const safe = (v ?? "").toString();
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi");
    out = out.replace(re, safe);
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

async function authorize(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth;

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return { ok: false as const, status: 403, error: "User inactive" };
  }

  if (!isPrivileged(role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user: auth.user };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ cadenceKey: string }> }
) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = await context.params;
  const cadenceKey = String(params.cadenceKey || "").trim();

  if (!cadenceKey) {
    return NextResponse.json({ error: "cadenceKey required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const previewStep = Number(url.searchParams.get("preview_step") || "1");

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
      is_active
    `)
    .eq("cadence_key", cadenceKey)
    .order("step", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const steps = data ?? [];

  if (steps.length === 0) {
    return NextResponse.json({ error: "Cadence not found" }, { status: 404 });
  }

  const previewSource =
    steps.find((s) => Number(s.step) === previewStep) ??
    steps[0];

  const sampleVars = {
    first_name: "Coach Smith",
    coach_name: "Coach Smith",
    last_name: "Smith",
    school_name: "Arizona State",
    email: "coach.smith@example.com",
  };

  const preview = previewSource
    ? {
        step: Number(previewSource.step || 1),
        subject: renderTemplate(previewSource.subject || "", sampleVars),
        body: renderTemplate(previewSource.body || "", sampleVars),
      }
    : null;

  return NextResponse.json({
    cadence_key: cadenceKey,
    steps,
    preview,
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ cadenceKey: string }> }
) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const params = await context.params;
  const cadenceKey = String(params.cadenceKey || "").trim();

  if (!cadenceKey) {
    return NextResponse.json({ error: "cadenceKey required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "save").trim();

  if (action === "save") {
    const steps = Array.isArray(body?.steps) ? body.steps : [];

    if (steps.length === 0) {
      return NextResponse.json({ error: "steps are required" }, { status: 400 });
    }

    for (const raw of steps) {
      const step = Number(raw?.step || 0);
      if (!step || step < 1) {
        return NextResponse.json({ error: "Each step must have a valid step number" }, { status: 400 });
      }

      const payload = {
        cadence_key: cadenceKey,
        step,
        name: String(raw?.name ?? "").trim() || `Step ${step}`,
        subject: String(raw?.subject ?? ""),
        body: String(raw?.body ?? ""),
        due_offset_days: Number(raw?.due_offset_days ?? 0),
        required_contact_status: String(raw?.required_contact_status ?? "").trim() || null,
        is_active: Boolean(raw?.is_active),
      };

      const { error } = await supabaseAdmin
        .from("cadence_template_steps")
        .upsert(payload, { onConflict: "cadence_key,step" });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    await supabaseAdmin.from("activities").insert({
      user_id: me,
      type: "system",
      occurred_at: new Date().toISOString(),
      subject: "Cadence updated",
      body: `Cadence ${cadenceKey} updated.`,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "add_step") {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("cadence_template_steps")
      .select("step")
      .eq("cadence_key", cadenceKey)
      .order("step", { ascending: false })
      .limit(1);

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    const nextStep = Number(existing?.[0]?.step || 0) + 1;

    const { error } = await supabaseAdmin
      .from("cadence_template_steps")
      .insert({
        cadence_key: cadenceKey,
        step: nextStep,
        name: `Step ${nextStep}`,
        subject: "",
        body: "",
        due_offset_days: 0,
        required_contact_status: "New",
        is_active: true,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, step: nextStep });
  }

  if (action === "delete_step") {
    const step = Number(body?.step || 0);

    if (!step || step < 1) {
      return NextResponse.json({ error: "Valid step required" }, { status: 400 });
    }

    const { data: allSteps, error: allStepsErr } = await supabaseAdmin
      .from("cadence_template_steps")
      .select("step")
      .eq("cadence_key", cadenceKey);

    if (allStepsErr) {
      return NextResponse.json({ error: allStepsErr.message }, { status: 500 });
    }

    if ((allSteps ?? []).length <= 1) {
      return NextResponse.json(
        { error: "A cadence must have at least one step" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("cadence_template_steps")
      .delete()
      .eq("cadence_key", cadenceKey)
      .eq("step", step);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}