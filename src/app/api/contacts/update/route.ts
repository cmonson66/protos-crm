import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canAssignContact,
  canEditContact,
  getRole,
  requireUser,
  type ContactAccessRecord,
} from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactVertical = "coaching" | "corporate";
type BuyingCommitteeRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "operator"
  | "unknown";

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

function isValidCommitteeRole(value: string): value is BuyingCommitteeRole {
  return (
    value === "economic_buyer" ||
    value === "technical_buyer" ||
    value === "champion" ||
    value === "operator" ||
    value === "unknown"
  );
}

const ALLOWED_STATUSES = new Set([
  "New",
  "Secured/Active",
  "Closed/Do Not Contact",
]);

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const roleResult = await getRole(me);
  const role = roleResult.role;
  const is_active = roleResult.is_active;

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const contact_id = clean(body.contact_id);

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }

  const { data: contact, error: readErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      owner_user_id,
      assigned_to_user_id,
      status,
      vertical,
      school_id,
      account_id,
      buying_committee_role_override
    `)
    .eq("id", contact_id)
    .maybeSingle<
      ContactAccessRecord & {
        id: string;
        status: string | null;
        vertical: ContactVertical | null;
        school_id: string | null;
        account_id: string | null;
        buying_committee_role_override: string | null;
      }
    >();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const canEdit = canEditContact(role, me, contact);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verticalRaw = clean(body.vertical || contact.vertical || "coaching").toLowerCase();
  if (!isValidVertical(verticalRaw)) {
    return NextResponse.json({ error: "Invalid vertical" }, { status: 400 });
  }
  const vertical: ContactVertical = verticalRaw;

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
  const status = maybeNull(body.status);

  const school_id_input = maybeNull(body.school_id);
  const account_id_input = maybeNull(body.account_id);

  const committeeRoleRaw = maybeNull(body.buying_committee_role_override);
  let buying_committee_role_override: BuyingCommitteeRole | null = null;

  if (committeeRoleRaw) {
    if (!isValidCommitteeRole(committeeRoleRaw)) {
      return NextResponse.json(
        { error: "Invalid buying committee role override" },
        { status: 400 }
      );
    }
    buying_committee_role_override = committeeRoleRaw;
  }

  if (!sport) {
    return NextResponse.json({ error: "sport is required" }, { status: 400 });
  }

  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let school_id: string | null = null;
  let account_id: string | null = null;

  if (vertical === "coaching") {
    school_id = school_id_input;
    account_id = null;
    buying_committee_role_override = null;
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
    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .ilike("primary_email", primary_email)
      .neq("id", contact_id)
      .limit(1)
      .maybeSingle();

    if (dupErr) {
      return NextResponse.json({ error: dupErr.message }, { status: 500 });
    }

    if (dup) {
      return NextResponse.json(
        { error: "Another contact already uses that email." },
        { status: 409 }
      );
    }
  }

  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
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
    rep_notes,
    buying_committee_role_override,
    updated_at: nowIso,
  };

  if (canAssignContact(role)) {
    patch.assigned_to_user_id = maybeNull(body.assigned_to_user_id);
    if (typeof body.active === "boolean") {
      patch.active = Boolean(body.active);
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from("contacts")
    .update(patch)
    .eq("id", contact_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (body && typeof body.profile === "object" && body.profile !== null) {
    const { error: profileErr } = await supabaseAdmin
      .from("contact_profiles")
      .upsert({
        contact_id,
        profile: body.profile,
        updated_at: nowIso,
      });

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }
  }

  if (status && status !== (contact.status ?? null)) {
    const { error: statusErr } = await supabaseAdmin.rpc("contact_set_status", {
      p_contact_id: contact_id,
      p_status: status,
    });

    if (statusErr) {
      return NextResponse.json(
        {
          error: statusErr.message,
          details: statusErr.details ?? null,
          hint: statusErr.hint ?? null,
          code: statusErr.code ?? null,
        },
        { status: 400 }
      );
    }
  }

  await supabaseAdmin.from("activities").insert({
    contact_id,
    user_id: me,
    type: "note",
    occurred_at: nowIso,
    subject: "Contact updated",
    body:
      vertical === "corporate"
        ? `Contact details were updated. Vertical is ${vertical}. Buying committee override is ${
            buying_committee_role_override ?? "inferred"
          }.${status && status !== (contact.status ?? null) ? ` Status changed to ${status}.` : ""}`
        : `Contact details were updated. Vertical is ${vertical}.${status && status !== (contact.status ?? null) ? ` Status changed to ${status}.` : ""}`,
  });

  return NextResponse.json({ ok: true });
}