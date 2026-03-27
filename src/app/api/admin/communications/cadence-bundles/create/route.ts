import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

type StepInput = {
  step_number: number;
  channel: "email" | "linkedin" | "call_script";
  delay_days: number;
  required_contact_status?: string | null;
  subject_template?: string | null;
  body_template: string;
  call_to_action?: string | null;
};

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

    const sequenceKey = clean(body.sequence_key);
    const sequenceName = clean(body.sequence_name);
    const vertical = clean(body.vertical);
    const audienceStage = clean(body.audience_stage);
    const status = clean(body.status || "draft");
    const description = maybeNull(body.description);

    const steps = Array.isArray(body.steps) ? (body.steps as StepInput[]) : [];

    if (!sequenceKey || !sequenceName || !vertical || !audienceStage) {
      return NextResponse.json(
        { error: "sequence_key, sequence_name, vertical, and audience_stage are required" },
        { status: 400 }
      );
    }

    if (!steps.length) {
      return NextResponse.json(
        { error: "At least one cadence step is required" },
        { status: 400 }
      );
    }

    const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);

    for (const step of sortedSteps) {
      if (!step.step_number || !step.channel || !clean(step.body_template)) {
        return NextResponse.json(
          { error: "Each step must include step_number, channel, and body_template" },
          { status: 400 }
        );
      }
    }

    const uniqueStepNumbers = new Set(sortedSteps.map((s) => s.step_number));
    if (uniqueStepNumbers.size !== sortedSteps.length) {
      return NextResponse.json(
        { error: "Step numbers must be unique" },
        { status: 400 }
      );
    }

    const { data: sequence, error: sequenceErr } = await supabaseAdmin
      .from("communication_sequences")
      .insert({
        key: sequenceKey,
        name: sequenceName,
        vertical,
        audience_stage: audienceStage,
        status,
        description,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("*")
      .single();

    if (sequenceErr) {
      return NextResponse.json({ error: sequenceErr.message }, { status: 500 });
    }

    const createdTemplateIds: string[] = [];

    for (const step of sortedSteps) {
      const templateKey = `${sequenceKey}_step_${step.step_number}`;

      const { data: template, error: templateErr } = await supabaseAdmin
        .from("message_templates")
        .insert({
          name: `${sequenceName} :: Step ${step.step_number}`,
          template_key: templateKey,
          status,
          channel: step.channel,
          template_type:
            step.channel === "linkedin"
              ? "linkedin_outreach"
              : step.channel === "call_script"
                ? "call_script"
                : "cadence",
          template_scope: "sequence_step",
          audience_stage: audienceStage,
          vertical,
          subject_template: step.channel === "email" ? maybeNull(step.subject_template) : null,
          body_template: clean(step.body_template),
          call_to_action: maybeNull(step.call_to_action),
          created_by: auth.user.id,
          updated_by: auth.user.id,
        })
        .select("id")
        .single();

      if (templateErr || !template) {
        return NextResponse.json(
          { error: templateErr?.message || "Failed to create step template" },
          { status: 500 }
        );
      }

      createdTemplateIds.push(template.id);

      const { error: stepErr } = await supabaseAdmin
        .from("communication_sequence_steps")
        .insert({
          sequence_id: sequence.id,
          step_number: step.step_number,
          channel: step.channel,
          template_id: template.id,
          delay_days: Number(step.delay_days || 0),
          required_contact_status: maybeNull(step.required_contact_status),
          is_active: true,
        });

      if (stepErr) {
        return NextResponse.json({ error: stepErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      sequence_id: sequence.id,
      created_template_ids: createdTemplateIds,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create cadence bundle" },
      { status: 500 }
    );
  }
}