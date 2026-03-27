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

type SequenceInput = {
  id: string;
  key: string;
  name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  status: "draft" | "active" | "archived";
  description?: string | null;
};

type StepInput = {
  id?: string | null;
  template_id?: string | null;
  step_number: number;
  channel: "email" | "linkedin" | "call_script";
  delay_days: number;
  required_contact_status?: string | null;
  is_active: boolean;
  template_name: string;
  subject_template?: string | null;
  body_template: string;
  call_to_action?: string | null;
};

function templateTypeForChannel(channel: StepInput["channel"]) {
  if (channel === "linkedin") return "linkedin_outreach";
  if (channel === "call_script") return "call_script";
  return "cadence";
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

    const sequence = (body.sequence || {}) as SequenceInput;
    const steps = Array.isArray(body.steps) ? (body.steps as StepInput[]) : [];

    if (!clean(sequence.id)) {
      return NextResponse.json({ error: "sequence.id is required" }, { status: 400 });
    }

    if (!clean(sequence.key) || !clean(sequence.name)) {
      return NextResponse.json(
        { error: "sequence key and name are required" },
        { status: 400 }
      );
    }

    if (!steps.length) {
      return NextResponse.json(
        { error: "At least one step is required" },
        { status: 400 }
      );
    }

    for (const [idx, step] of steps.entries()) {
      if (!step.channel) {
        return NextResponse.json(
          { error: `Step ${idx + 1} is missing channel` },
          { status: 400 }
        );
      }

      if (!clean(step.body_template)) {
        return NextResponse.json(
          { error: `Step ${idx + 1} is missing body_template` },
          { status: 400 }
        );
      }

      if (step.channel === "email" && !clean(step.subject_template)) {
        return NextResponse.json(
          { error: `Step ${idx + 1} is missing subject_template` },
          { status: 400 }
        );
      }
    }

    const { error: sequenceErr } = await supabaseAdmin
      .from("communication_sequences")
      .update({
        key: clean(sequence.key),
        name: clean(sequence.name),
        vertical: clean(sequence.vertical),
        audience_stage: clean(sequence.audience_stage),
        status: clean(sequence.status),
        description: maybeNull(sequence.description),
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clean(sequence.id));

    if (sequenceErr) {
      return NextResponse.json({ error: sequenceErr.message }, { status: 500 });
    }

    const { data: existingSteps, error: existingStepsErr } = await supabaseAdmin
      .from("communication_sequence_steps")
      .select("id, template_id")
      .eq("sequence_id", clean(sequence.id));

    if (existingStepsErr) {
      return NextResponse.json({ error: existingStepsErr.message }, { status: 500 });
    }

    const existingStepIds = new Set((existingSteps || []).map((s) => s.id));
    const submittedExistingIds = new Set(
      steps.map((s) => clean(s.id)).filter(Boolean)
    );

    const removedStepIds = (existingSteps || [])
      .map((s) => s.id)
      .filter((id) => !submittedExistingIds.has(id));

    if (removedStepIds.length) {
      const { error: deleteErr } = await supabaseAdmin
        .from("communication_sequence_steps")
        .delete()
        .in("id", removedStepIds);

      if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
      }
    }

    for (const [idx, rawStep] of steps.entries()) {
      const stepNumber = idx + 1;
      const channel = rawStep.channel;
      const templateName = clean(rawStep.template_name) || `${sequence.name} :: Step ${stepNumber}`;

      let templateId = clean(rawStep.template_id) || null;

      if (templateId) {
        const { error: templateUpdateErr } = await supabaseAdmin
          .from("message_templates")
          .update({
            name: templateName,
            template_key: `${clean(sequence.key)}_step_${stepNumber}`,
            status: clean(sequence.status),
            channel,
            template_type: templateTypeForChannel(channel),
            template_scope: "sequence_step",
            audience_stage: clean(sequence.audience_stage),
            vertical: clean(sequence.vertical),
            subject_template: channel === "email" ? maybeNull(rawStep.subject_template) : null,
            body_template: clean(rawStep.body_template),
            call_to_action: maybeNull(rawStep.call_to_action),
            updated_by: auth.user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", templateId);

        if (templateUpdateErr) {
          return NextResponse.json({ error: templateUpdateErr.message }, { status: 500 });
        }
      } else {
        const { data: template, error: templateCreateErr } = await supabaseAdmin
          .from("message_templates")
          .insert({
            name: templateName,
            template_key: `${clean(sequence.key)}_step_${stepNumber}`,
            status: clean(sequence.status),
            channel,
            template_type: templateTypeForChannel(channel),
            template_scope: "sequence_step",
            audience_stage: clean(sequence.audience_stage),
            vertical: clean(sequence.vertical),
            subject_template: channel === "email" ? maybeNull(rawStep.subject_template) : null,
            body_template: clean(rawStep.body_template),
            call_to_action: maybeNull(rawStep.call_to_action),
            created_by: auth.user.id,
            updated_by: auth.user.id,
          })
          .select("id")
          .single();

        if (templateCreateErr || !template) {
          return NextResponse.json(
            { error: templateCreateErr?.message || "Failed to create step template" },
            { status: 500 }
          );
        }

        templateId = template.id;
      }

      const stepPayload = {
        sequence_id: clean(sequence.id),
        step_number: stepNumber,
        channel,
        template_id: templateId,
        delay_days: Number(rawStep.delay_days || 0),
        required_contact_status: maybeNull(rawStep.required_contact_status),
        is_active: rawStep.is_active !== false,
        updated_at: new Date().toISOString(),
      };

      const stepId = clean(rawStep.id);

      if (stepId && existingStepIds.has(stepId)) {
        const { error: stepUpdateErr } = await supabaseAdmin
          .from("communication_sequence_steps")
          .update(stepPayload)
          .eq("id", stepId);

        if (stepUpdateErr) {
          return NextResponse.json({ error: stepUpdateErr.message }, { status: 500 });
        }
      } else {
        const { error: stepCreateErr } = await supabaseAdmin
          .from("communication_sequence_steps")
          .insert(stepPayload);

        if (stepCreateErr) {
          return NextResponse.json({ error: stepCreateErr.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to save sequence" },
      { status: 500 }
    );
  }
}