import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { renderMessageTemplate } from "@/lib/messaging/render";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  phone: string | null;
  job_title_raw: string | null;
  vertical: string | null;
  status: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  cadence_status: string | null;
  cadence_next_due_at: string | null;
  assigned_to_user_id: string | null;
  owner_user_id: string | null;
  schools?: { name: string | null } | null;
  accounts?: { name: string | null } | null;
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

type RepProfileRow = {
  full_name: string | null;
};

async function loadRepContext(userId: string | null) {
  if (!userId) {
    return {
      id: null,
      full_name: null,
      email: null,
    };
  }

  let full_name: string | null = null;
  let email: string | null = null;

  const { data: profileData } = await supabaseAdmin
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle<RepProfileRow>();

  full_name = profileData?.full_name ?? null;

  try {
    const authUserResult = await supabaseAdmin.auth.admin.getUserById(userId);
    email = authUserResult.data.user?.email ?? null;
  } catch {
    email = null;
  }

  return {
    id: userId,
    full_name,
    email,
  };
}

export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const contact_id = (url.searchParams.get("contact_id") || "").trim();
    const cadence_key_override = (url.searchParams.get("cadence_key") || "").trim();
    const step_override_raw = (url.searchParams.get("step") || "").trim();

    if (!contact_id) {
      return NextResponse.json(
        { error: "contact_id is required" },
        { status: 400 }
      );
    }

    const { data: c, error: cErr } = await supabaseAdmin
      .from("contacts")
      .select(`
        id,
        first_name,
        last_name,
        primary_email,
        phone,
        job_title_raw,
        vertical,
        status,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at,
        assigned_to_user_id,
        owner_user_id,
        schools(name),
        accounts!contacts_account_id_fkey(name)
      `)
      .eq("id", contact_id)
      .maybeSingle<ContactRow>();

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    if (!c) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (
      !isPrivileged(role) &&
      c.assigned_to_user_id !== me &&
      c.owner_user_id !== me
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cadenceKey = cadence_key_override || String(c.cadence_key || "").trim();

    if (!cadenceKey) {
      return NextResponse.json(
        { error: "No cadence key available for preview" },
        { status: 400 }
      );
    }

    let stepToRender = 1;
    if (step_override_raw) {
      const parsed = Number(step_override_raw);
      stepToRender = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    } else {
      const savedStep = Number(c.cadence_step ?? 0);
      stepToRender = savedStep > 0 ? savedStep : 1;
    }

    const { data: stepRow, error: stepErr } = await supabaseAdmin
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
      .eq("cadence_key", cadenceKey)
      .eq("step", stepToRender)
      .maybeSingle<SequenceStepRow>();

    if (stepErr) {
      return NextResponse.json({ error: stepErr.message }, { status: 500 });
    }

    if (!stepRow) {
      return NextResponse.json(
        {
          error: `No active prospecting sequence step found for cadence_key=${cadenceKey} step=${stepToRender}`,
        },
        { status: 404 }
      );
    }

    const normalizedContactVertical =
      c.vertical === "corporate" ? "corporate" : "athletics";

    if (stepRow.vertical !== normalizedContactVertical) {
      return NextResponse.json(
        {
          error: `Cadence ${cadenceKey} is ${stepRow.vertical} and cannot be previewed for ${normalizedContactVertical} contacts.`,
        },
        { status: 400 }
      );
    }

    const repUserId = c.assigned_to_user_id || c.owner_user_id || null;
    const rep = await loadRepContext(repUserId);

    const rendered = renderMessageTemplate(
      {
        id: stepRow.template_id || "",
        name:
          stepRow.template_name ||
          `${stepRow.cadence_name} :: Step ${stepRow.step}`,
        template_key: stepRow.template_key,
        status: (stepRow.template_status || "active") as any,
        channel: (stepRow.template_channel || stepRow.channel) as any,
        template_type: (stepRow.template_type || "cadence") as any,
        template_scope: stepRow.template_scope,
        audience_stage: stepRow.audience_stage as any,
        vertical: stepRow.vertical as any,
        product_tree_family: null,
        product_tree_category: null,
        product_tree_subcategory: null,
        product_tree_item: null,
        subject_template: stepRow.subject,
        body_template: stepRow.body || "",
        call_to_action: stepRow.call_to_action,
        created_at: null as any,
        updated_at: null as any,
      } as any,
      {
        contact: {
          id: c.id,
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
          primary_email: c.primary_email ?? null,
          phone: c.phone ?? null,
          job_title_raw: c.job_title_raw ?? null,
          status: c.status ?? null,
          vertical: normalizedContactVertical,
          school_name: c.schools?.name ?? null,
          account_name: c.accounts?.name ?? null,
        },
        rep: {
          id: rep.id,
          full_name: rep.full_name,
          email: rep.email,
        },
        opportunity: null,
      }
    );

    return NextResponse.json({
      ok: true,
      cadence_key: cadenceKey,
      cadence_name: stepRow.cadence_name,
      step: stepToRender,
      channel: stepRow.channel,
      required_contact_status: stepRow.required_contact_status ?? null,
      subject: rendered.subject ?? "",
      body: rendered.body,
      call_to_action: stepRow.call_to_action ?? null,
      to_email: c.primary_email ?? null,
      contact_status: c.status ?? "",
      cadence_status: c.cadence_status ?? "",
      cadence_next_due_at: c.cadence_next_due_at ?? null,
      template_id: stepRow.template_id,
      sequence_id: stepRow.sequence_id,
      sequence_step_id: stepRow.sequence_step_id,
      rep_name: rep.full_name,
      rep_email: rep.email,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}