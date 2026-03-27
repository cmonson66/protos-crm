import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  status: string;
  active: boolean | null;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_next_due_at: string | null;
  cadence_started_at: string | null;
  cadence_updated_at: string | null;
  vertical: string | null;
};

type TaskRow = {
  id: string;
  contact_id: string;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  task_type: string | null;
  due_at: string | null;
  title: string | null;
  notes: string | null;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  completed_at: string | null;
  created_at: string | null;
};

type SequenceStepRow = {
  sequence_id: string;
  cadence_key: string;
  cadence_name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  sequence_status: "draft" | "active" | "archived";
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

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function normalizeVertical(v: string | null | undefined): "athletics" | "corporate" {
  return v === "corporate" ? "corporate" : "athletics";
}

function mapTaskType(
  channel: "email" | "linkedin" | "call_script" | "task"
): string {
  if (channel === "call_script") return "call";
  return channel;
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const me = auth.user.id;
    const { role, is_active } = await getRole(me);

    if (!is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const contact_id = String(body?.contact_id || "").trim();

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select(`
        id,
        status,
        active,
        assigned_to_user_id,
        owner_user_id,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at,
        cadence_started_at,
        cadence_updated_at,
        vertical
      `)
      .eq("id", contact_id)
      .maybeSingle<ContactRow>();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (!isPrivileged(role) && contact.assigned_to_user_id !== me && contact.owner_user_id !== me) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (contact.active === false) {
      return NextResponse.json({ error: "Contact inactive" }, { status: 400 });
    }

    if (
      !contact.cadence_key ||
      contact.cadence_status !== "active" ||
      Number(contact.cadence_step || 0) < 1
    ) {
      return NextResponse.json(
        { error: "Contact does not have an active cadence to advance" },
        { status: 400 }
      );
    }

    const cadence_key = String(contact.cadence_key);
    const currentStep = Number(contact.cadence_step || 0);
    const now = new Date();
    const nowIso = now.toISOString();
    const normalizedVertical = normalizeVertical(contact.vertical);

    const { data: currentTaskRows, error: currentTaskErr } = await supabaseAdmin
      .from("tasks")
      .select(`
        id,
        contact_id,
        assigned_to_user_id,
        owner_user_id,
        task_type,
        due_at,
        title,
        notes,
        status,
        kind,
        cadence_key,
        cadence_step,
        completed_at,
        created_at
      `)
      .eq("contact_id", contact_id)
      .eq("kind", "cadence")
      .eq("cadence_step", currentStep)
      .is("completed_at", null)
      .order("created_at", { ascending: false });

    if (currentTaskErr) {
      return NextResponse.json({ error: currentTaskErr.message }, { status: 500 });
    }

    const currentTask = ((currentTaskRows ?? []) as TaskRow[])[0] ?? null;

    if (!currentTask) {
      return NextResponse.json(
        {
          error: `No open cadence task found for ${cadence_key} step ${currentStep}`,
        },
        { status: 404 }
      );
    }

    const { error: closeCurrentErr } = await supabaseAdmin
      .from("tasks")
      .update({
        completed_at: nowIso,
        status: "closed",
      })
      .eq("id", currentTask.id);

    if (closeCurrentErr) {
      return NextResponse.json({ error: closeCurrentErr.message }, { status: 500 });
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
      .eq("cadence_key", cadence_key)
      .eq("step", nextStepNumber)
      .maybeSingle<SequenceStepRow>();

    if (nextStepErr) {
      return NextResponse.json({ error: nextStepErr.message }, { status: 500 });
    }

    if (!nextStep) {
      const { error: completeErr } = await supabaseAdmin
        .from("contacts")
        .update({
          cadence_status: "completed",
          cadence_next_due_at: null,
          cadence_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", contact_id);

      if (completeErr) {
        return NextResponse.json({ error: completeErr.message }, { status: 500 });
      }

      await supabaseAdmin.from("activities").insert({
        contact_id,
        user_id: me,
        type: "cadence",
        occurred_at: nowIso,
        subject: "Cadence completed",
        body: `Cadence ${cadence_key} completed after step ${currentStep}.`,
        outcome: "completed",
      });

      return NextResponse.json({
        ok: true,
        completed: true,
        cadence_key,
        previous_step: currentStep,
        next_step: null,
      });
    }

    if (nextStep.vertical !== normalizedVertical) {
      return NextResponse.json(
        {
          error: `Next cadence step vertical mismatch: ${nextStep.vertical} vs ${normalizedVertical}`,
        },
        { status: 400 }
      );
    }

    if (
      nextStep.required_contact_status &&
      nextStep.required_contact_status !== contact.status
    ) {
      const { error: stopErr } = await supabaseAdmin
        .from("contacts")
        .update({
          cadence_status: "stopped",
          cadence_next_due_at: null,
          cadence_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", contact_id);

      if (stopErr) {
        return NextResponse.json({ error: stopErr.message }, { status: 500 });
      }

      await supabaseAdmin.from("activities").insert({
        contact_id,
        user_id: me,
        type: "cadence",
        occurred_at: nowIso,
        subject: "Cadence stopped",
        body: `Cadence ${cadence_key} stopped before step ${nextStepNumber} because contact status is ${contact.status}.`,
        outcome: "stopped",
      });

      return NextResponse.json({
        ok: true,
        completed: false,
        stopped: true,
        reason: `Next step requires status ${nextStep.required_contact_status}`,
      });
    }

    const nextDue = addDays(now, Number(nextStep.due_offset_days || 0)).toISOString();
    const nextTaskType = mapTaskType(nextStep.channel);

    const { data: existingNextStepTasks, error: existingNextErr } = await supabaseAdmin
      .from("tasks")
      .select(`
        id,
        contact_id,
        assigned_to_user_id,
        owner_user_id,
        task_type,
        due_at,
        title,
        notes,
        status,
        kind,
        cadence_key,
        cadence_step,
        completed_at,
        created_at
      `)
      .eq("contact_id", contact_id)
      .eq("kind", "cadence")
      .eq("cadence_step", nextStepNumber)
      .order("created_at", { ascending: false });

    if (existingNextErr) {
      return NextResponse.json({ error: existingNextErr.message }, { status: 500 });
    }

    const nextTasks = (existingNextStepTasks ?? []) as TaskRow[];
    const openNextTasks = nextTasks.filter((t) => !t.completed_at);
    const reusableNextTask = openNextTasks[0] ?? nextTasks[0] ?? null;

    if (openNextTasks.length > 1) {
      const duplicateIds = openNextTasks.slice(1).map((t) => t.id);
      if (duplicateIds.length > 0) {
        const { error: dupCloseErr } = await supabaseAdmin
          .from("tasks")
          .update({
            completed_at: nowIso,
            status: "closed",
          })
          .in("id", duplicateIds);

        if (dupCloseErr) {
          return NextResponse.json({ error: dupCloseErr.message }, { status: 500 });
        }
      }
    }

    if (reusableNextTask?.id) {
      const { error: reuseErr } = await supabaseAdmin
        .from("tasks")
        .update({
          assigned_to_user_id: contact.assigned_to_user_id || me,
          owner_user_id: contact.owner_user_id || me,
          task_type: nextTaskType,
          due_at: nextDue,
          title: nextStep.subject,
          notes: nextStep.body,
          status: "open",
          completed_at: null,
          kind: "cadence",
          cadence_key,
          cadence_step: nextStepNumber,
        })
        .eq("id", reusableNextTask.id);

      if (reuseErr) {
        return NextResponse.json({ error: reuseErr.message }, { status: 500 });
      }
    } else {
      const { error: insertErr } = await supabaseAdmin.from("tasks").insert({
        contact_id,
        assigned_to_user_id: contact.assigned_to_user_id || me,
        owner_user_id: contact.owner_user_id || me,
        task_type: nextTaskType,
        due_at: nextDue,
        title: nextStep.subject,
        notes: nextStep.body,
        status: "open",
        kind: "cadence",
        cadence_key,
        cadence_step: nextStepNumber,
      });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    const { error: contactAdvanceErr } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_key,
        cadence_step: nextStepNumber,
        cadence_status: "active",
        cadence_next_due_at: nextDue,
        cadence_started_at: contact.cadence_started_at ?? nowIso,
        cadence_updated_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", contact_id);

    if (contactAdvanceErr) {
      return NextResponse.json({ error: contactAdvanceErr.message }, { status: 500 });
    }

    await supabaseAdmin.from("activities").insert({
      contact_id,
      user_id: me,
      type: "cadence",
      occurred_at: nowIso,
      subject: "Cadence advanced",
      body: `Cadence ${cadence_key} advanced from step ${currentStep} to step ${nextStepNumber} (${nextStep.channel}).`,
      outcome: "advanced",
    });

    return NextResponse.json({
      ok: true,
      completed: false,
      cadence_key,
      previous_step: currentStep,
      next_step: {
        step: nextStepNumber,
        channel: nextStep.channel,
        subject: nextStep.subject ?? "",
        due_at: nextDue,
        template_id: nextStep.template_id,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}