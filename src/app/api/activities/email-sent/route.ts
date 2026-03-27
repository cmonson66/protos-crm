import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runCadenceAutopilot } from "@/lib/cadenceAutopilot";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logContactMessage } from "@/lib/messaging/service";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  status: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_next_due_at: string | null;
};

type SequenceStepRow = {
  sequence_id: string;
  cadence_key: string;
  cadence_name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  sequence_status: string;
  sequence_step_id: string;
  step: number;
  channel: "email" | "linkedin" | "call_script" | "task";
  due_offset_days: number;
  required_contact_status: string | null;
  step_is_active: boolean;
  template_id: string | null;
  template_name: string | null;
  template_key: string | null;
  template_status: string | null;
  template_channel: "email" | "linkedin" | "call_script" | "task" | null;
  template_type: string | null;
  template_scope: string | null;
  subject: string | null;
  body: string | null;
  call_to_action: string | null;
};

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function fallbackAdvanceCadence(params: {
  contact: ContactRow;
  actorUserId: string;
}) {
  const { contact, actorUserId } = params;

  if (!contact.cadence_key || contact.cadence_status !== "active") {
    return {
      ok: true as const,
      action: "noop" as const,
      reason: "Cadence not active on contact",
    };
  }

  const currentStep = Number(contact.cadence_step ?? 0);
  if (currentStep < 1) {
    return {
      ok: true as const,
      action: "noop" as const,
      reason: "Contact has no valid active cadence step",
    };
  }

  const nextStepNumber = currentStep + 1;

  const { data: nextStep, error: nextStepErr } = await supabaseAdmin
    .from("v_active_prospecting_sequence_steps")
    .select(`
      sequence_id,
      cadence_key,
      cadence_name,
      vertical,
      audience_stage,
      sequence_status,
      sequence_step_id,
      step,
      channel,
      due_offset_days,
      required_contact_status,
      step_is_active,
      template_id,
      template_name,
      template_key,
      template_status,
      template_channel,
      template_type,
      template_scope,
      subject,
      body,
      call_to_action
    `)
    .eq("cadence_key", contact.cadence_key)
    .eq("step", nextStepNumber)
    .maybeSingle<SequenceStepRow>();

  if (nextStepErr) {
    return {
      ok: false as const,
      error: nextStepErr.message,
      context: "fallback_lookup_failed",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (!nextStep) {
    const { error: contactCompleteErr } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_step: currentStep,
        cadence_status: "completed",
        cadence_next_due_at: null,
        cadence_updated_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", contact.id);

    if (contactCompleteErr) {
      return {
        ok: false as const,
        error: contactCompleteErr.message,
        context: "fallback_complete_contact_failed",
      };
    }

    await supabaseAdmin.from("activities").insert({
      contact_id: contact.id,
      user_id: actorUserId,
      type: "cadence",
      occurred_at: nowIso,
      subject: "Cadence completed",
      body: `Cadence ${contact.cadence_key} completed after step ${currentStep}.`,
      outcome: "completed",
    });

    return {
      ok: true as const,
      action: "completed" as const,
      cadence_key: contact.cadence_key,
      completed_step: currentStep,
    };
  }

  if (
    nextStep.required_contact_status &&
    String(nextStep.required_contact_status) !== String(contact.status ?? "")
  ) {
    const { error: contactStopErr } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_status: "stopped",
        cadence_next_due_at: null,
        cadence_updated_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", contact.id);

    if (contactStopErr) {
      return {
        ok: false as const,
        error: contactStopErr.message,
        context: "fallback_stop_contact_failed",
      };
    }

    await supabaseAdmin.from("activities").insert({
      contact_id: contact.id,
      user_id: actorUserId,
      type: "cadence",
      occurred_at: nowIso,
      subject: "Cadence stopped",
      body: `Cadence ${contact.cadence_key} stopped at step ${nextStepNumber} because contact status is ${contact.status ?? "unknown"}.`,
      outcome: "stopped",
    });

    return {
      ok: true as const,
      action: "stopped" as const,
      cadence_key: contact.cadence_key,
      stopped_at_step: nextStepNumber,
      reason: "required_contact_status_mismatch",
    };
  }

  const nextDueAt = addDays(now, Number(nextStep.due_offset_days || 0)).toISOString();

  const { data: existingTasks, error: taskReadErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      completed_at
    `)
    .eq("contact_id", contact.id)
    .eq("kind", "cadence")
    .eq("cadence_step", nextStepNumber)
    .order("created_at", { ascending: false });

  if (taskReadErr) {
    return {
      ok: false as const,
      error: taskReadErr.message,
      context: "fallback_read_tasks_failed",
    };
  }

  const openTask = (existingTasks ?? []).find((t) => !t.completed_at) ?? null;
  const reusableTask = openTask ?? (existingTasks?.[0] ?? null);

  if (reusableTask?.id) {
    const { error: reviveErr } = await supabaseAdmin
      .from("tasks")
      .update({
        assigned_to_user_id: contact.assigned_to_user_id || actorUserId,
        owner_user_id: contact.owner_user_id || actorUserId,
        task_type: nextStep.channel === "call_script" ? "call" : nextStep.channel,
        due_at: nextDueAt,
        title: nextStep.subject || nextStep.template_name || `${nextStep.cadence_name} step ${nextStep.step}`,
        notes: nextStep.body || null,
        status: "open",
        completed_at: null,
        cadence_key: contact.cadence_key,
        cadence_step: nextStepNumber,
      })
      .eq("id", reusableTask.id);

    if (reviveErr) {
      return {
        ok: false as const,
        error: reviveErr.message,
        context: "fallback_reuse_task_failed",
      };
    }
  } else {
    const { error: insertTaskErr } = await supabaseAdmin.from("tasks").insert({
      contact_id: contact.id,
      assigned_to_user_id: contact.assigned_to_user_id || actorUserId,
      owner_user_id: contact.owner_user_id || actorUserId,
      task_type: nextStep.channel === "call_script" ? "call" : nextStep.channel,
      due_at: nextDueAt,
      title: nextStep.subject || nextStep.template_name || `${nextStep.cadence_name} step ${nextStep.step}`,
      notes: nextStep.body || null,
      status: "open",
      kind: "cadence",
      cadence_key: contact.cadence_key,
      cadence_step: nextStepNumber,
    });

    if (insertTaskErr) {
      return {
        ok: false as const,
        error: insertTaskErr.message,
        context: "fallback_insert_task_failed",
      };
    }
  }

  const { error: contactAdvanceErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_step: nextStepNumber,
      cadence_status: "active",
      cadence_next_due_at: nextDueAt,
      cadence_updated_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", contact.id);

  if (contactAdvanceErr) {
    return {
      ok: false as const,
      error: contactAdvanceErr.message,
      context: "fallback_advance_contact_failed",
    };
  }

  await supabaseAdmin.from("activities").insert({
    contact_id: contact.id,
    user_id: actorUserId,
    type: "cadence",
    occurred_at: nowIso,
    subject: "Cadence advanced",
    body: `Cadence ${contact.cadence_key} advanced from step ${currentStep} to step ${nextStepNumber} (${nextStep.channel}).`,
    outcome: "advanced",
  });

  return {
    ok: true as const,
    action: "advanced" as const,
    cadence_key: contact.cadence_key,
    previous_step: currentStep,
    next_step: nextStepNumber,
    next_channel: nextStep.channel,
    next_due_at: nextDueAt,
  };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userErr || !userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const contact_id = String(body?.contact_id || "").trim();
    const subject = body?.subject ? String(body.subject) : null;
    const email_body = body?.body ? String(body.body) : null;
    const complete_task_id = body?.complete_task_id
      ? String(body.complete_task_id)
      : null;
    const template_id = body?.template_id ? String(body.template_id) : null;

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select(`
        id,
        assigned_to_user_id,
        owner_user_id,
        status,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at
      `)
      .eq("id", contact_id)
      .maybeSingle<ContactRow>();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 400 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const { error: logEmailErr } = await supabase.rpc("log_email_sent", {
      p_contact_id: contact_id,
      p_actor_user_id: userId,
      p_subject: subject,
      p_body: email_body,
      p_complete_task_id: complete_task_id,
    });

    if (logEmailErr) {
      return NextResponse.json({ error: logEmailErr.message }, { status: 400 });
    }

    await logContactMessage({
      contact_id,
      template_id,
      cadence_key: contact?.cadence_key ?? null,
      cadence_step:
        contact?.cadence_status === "active"
          ? Number(contact?.cadence_step ?? 0) || null
          : null,
      channel: "email",
      subject_rendered: subject,
      body_rendered: email_body || "",
      delivery_status: "logged",
      sent_by: userId,
    });

    const autopilot = await runCadenceAutopilot({
      contactId: contact_id,
      actorUserId: userId,
      signal: "email",
      note: subject || email_body || null,
    });

    if (autopilot.ok && autopilot.action !== "noop") {
      return NextResponse.json({ ok: true, autopilot, source: "autopilot" });
    }

    const fallback = await fallbackAdvanceCadence({
      contact,
      actorUserId: userId,
    });

    if (!fallback.ok) {
      return NextResponse.json(
        {
          error: fallback.error,
          context: fallback.context ?? "email_logged_but_fallback_failed",
          autopilot:
            autopilot.ok
              ? autopilot
              : {
                  ok: false,
                  error: autopilot.error,
                  guard: autopilot.guard ?? null,
                },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      autopilot,
      fallback,
      source: "fallback",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}