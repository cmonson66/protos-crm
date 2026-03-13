import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canAssignContact,
  canCreateContact,
  getRole,
  requireUser,
} from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactVertical = "coaching" | "corporate";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

function isValidVertical(value: string): value is ContactVertical {
  return value === "coaching" || value === "corporate";
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

  if (!canCreateContact(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const verticalRaw = clean(body.vertical || "coaching").toLowerCase();
  const vertical: ContactVertical = isValidVertical(verticalRaw)
    ? verticalRaw
    : "coaching";

  const first_name = maybeNull(body.first_name);
  const last_name = maybeNull(body.last_name);
  const primary_email = maybeNull(body.primary_email)?.toLowerCase() ?? null;
  const job_title_raw = maybeNull(body.job_title_raw);
  const phone = maybeNull(body.phone);
  const sport = clean(body.sport);
  const division = maybeNull(body.division);
  const conference = maybeNull(body.conference);
  const region = maybeNull(body.region);
  const rep_notes = maybeNull(body.rep_notes);
  const status = maybeNull(body.status) ?? "New";
  const cadence_key_input = maybeNull(body.cadence_key);

  const school_id_input = maybeNull(body.school_id);
  const account_id_input = maybeNull(body.account_id);

  const assignedInput = maybeNull(body.assigned_to_user_id);
  const activeInput =
    typeof body.active === "boolean" ? Boolean(body.active) : true;

  if (!first_name && !last_name && !primary_email) {
    return NextResponse.json(
      { error: "At least one of first name, last name, or email is required." },
      { status: 400 }
    );
  }

  if (!sport) {
    return NextResponse.json({ error: "sport is required" }, { status: 400 });
  }

  if (
    status !== "New" &&
    status !== "Secured/Active" &&
    status !== "Closed/Do Not Contact"
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let school_id: string | null = null;
  let account_id: string | null = null;

  if (vertical === "coaching") {
    school_id = school_id_input;
    account_id = null;
  } else {
    school_id = null;
    account_id = account_id_input;
  }

  if (vertical === "coaching" && school_id) {
    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .select("id")
      .eq("id", school_id)
      .maybeSingle();

    if (schoolErr) {
      return NextResponse.json({ error: schoolErr.message }, { status: 500 });
    }

    if (!school) {
      return NextResponse.json(
        { error: "Selected school not found." },
        { status: 400 }
      );
    }
  }

  if (vertical === "corporate" && account_id) {
    const { data: account, error: accountErr } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("id", account_id)
      .maybeSingle();

    if (accountErr) {
      return NextResponse.json({ error: accountErr.message }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json(
        { error: "Selected account not found." },
        { status: 400 }
      );
    }
  }

  if (primary_email) {
    const { data: existing, error: dupErr } = await supabaseAdmin
      .from("contacts")
      .select("id, primary_email")
      .ilike("primary_email", primary_email)
      .limit(1)
      .maybeSingle();

    if (dupErr) {
      return NextResponse.json({ error: dupErr.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        { error: "A contact with that email already exists." },
        { status: 409 }
      );
    }
  }

  let cadence_key: string | null = null;
  if (cadence_key_input) {
    const { data: cadenceTemplate, error: cadenceErr } = await supabaseAdmin
      .from("cadence_templates")
      .select("key, vertical, is_active")
      .eq("key", cadence_key_input)
      .eq("is_active", true)
      .maybeSingle();

    if (cadenceErr) {
      return NextResponse.json({ error: cadenceErr.message }, { status: 500 });
    }

    if (!cadenceTemplate) {
      return NextResponse.json({ error: "Selected cadence not found." }, { status: 400 });
    }

    if (cadenceTemplate.vertical !== vertical) {
      return NextResponse.json(
        { error: `Cadence ${cadence_key_input} does not match ${vertical} contact vertical.` },
        { status: 400 }
      );
    }

    cadence_key = cadence_key_input;
  }

  let assigned_to_user_id: string | null = null;
  let active = true;

  if (canAssignContact(role)) {
    assigned_to_user_id = assignedInput;
    active = activeInput;
  } else {
    assigned_to_user_id = me;
    active = true;
  }

  const nowIso = new Date().toISOString();

  const insertRow = {
    vertical,
    school_id,
    account_id,
    first_name,
    last_name,
    primary_email,
    job_title_raw,
    phone,
    sport,
    division,
    conference,
    region,
    owner_user_id: me,
    assigned_to_user_id,
    status,
    active,
    rep_notes,
    cadence_key,
    cadence_step: 0,
    cadence_status: "inactive",
    cadence_next_due_at: null,
    cadence_started_at: null,
    cadence_updated_at: cadence_key ? nowIso : null,
    last_activity_at: null,
    last_activity_type: null,
    last_activity_subject: null,
  };

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profilePayload =
    body && typeof body.profile === "object" && body.profile !== null
      ? body.profile
      : {};

  await supabaseAdmin.from("contact_profiles").upsert({
    contact_id: data.id,
    profile: profilePayload,
    updated_at: nowIso,
  });

  await supabaseAdmin.from("activities").insert({
    contact_id: data.id,
    user_id: me,
    type: "note",
    occurred_at: nowIso,
    subject: "Contact created",
    body:
      vertical === "corporate"
        ? cadence_key
          ? `Corporate contact added manually through CRM with cadence ${cadence_key} assigned.`
          : "Corporate contact added manually through CRM."
        : cadence_key
          ? `Coaching contact added manually through CRM with cadence ${cadence_key} assigned.`
          : "Coaching contact added manually through CRM.",
  });

  return NextResponse.json({ ok: true, contact_id: data.id });
}