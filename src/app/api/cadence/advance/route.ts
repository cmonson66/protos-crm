import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

type ContactRow = {
  id: string;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
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
  template_channel: string | null;
  template_type: string | null;
  template_scope: string | null;
  subject: string | null;
  body: string | null;
  call_to_action: string | null;
};

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

  const body = await req.json().catch(() => ({}));
  const contact_id = String(body.contact_id || "").trim();

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  }

  const { data: c, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id,assigned_to_user_id,owner_user_id,cadence_key,cadence_step,cadence_status")
    .eq("id", contact_id)
    .maybeSingle<ContactRow>();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  if (!c) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isPrivileged(role) && c.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!c.cadence_key || c.cadence_status !== "active") {
    return NextResponse.json({ error: "No active cadence on contact" }, { status: 400 });
  }

  const nextStep = Number(c.cadence_step || 0) + 1;

  const { data: step, error: sErr } = await supabaseAdmin
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
    .eq("cadence_key", c.cadence_key)
    .eq("step", nextStep)
    .maybeSingle<SequenceStepRow>();

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  if (!step) {
    const now = new Date().toISOString();

    const { error: finErr } = await supabaseAdmin
      .from("contacts")
      .update({
        cadence_status: "completed",
        cadence_next_due_at: null,
        cadence_updated_at: now,
        updated_at: now,
      })
      .eq("id", contact_id);

    if (finErr) {
      return NextResponse.json({ error: finErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, finished: true });
  }

  const now = new Date();
  const due = addDays(now, Number(step.due_offset_days || 0));

  const { error: upErr } = await supabaseAdmin
    .from("contacts")
    .update({
      cadence_step: nextStep,
      cadence_status: "active",
      cadence_updated_at: now.toISOString(),
      cadence_next_due_at: due.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", contact_id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const taskType =
    step.channel === "email"
      ? "email"
      : step.channel === "linkedin"
        ? "linkedin"
        : step.channel === "call_script"
          ? "call_script"
          : "task";

  const taskTitle =
    step.subject ||
    step.template_name ||
    `${step.cadence_name} Step ${step.step}`;

  const taskNotes = step.body || "";

  const { error: taskErr } = await supabaseAdmin.from("tasks").insert({
    contact_id,
    assigned_to_user_id: c.assigned_to_user_id ?? me,
    owner_user_id: c.owner_user_id ?? me,
    task_type: taskType,
    due_at: due.toISOString(),
    title: taskTitle,
    notes: taskNotes,
    status: "open",
    kind: "cadence",
    cadence_key: c.cadence_key,
    cadence_step: nextStep,
  });

  if (taskErr && !taskErr.message.toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, finished: false, step: nextStep });
}