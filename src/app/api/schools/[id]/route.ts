import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type ContactRow = {
  id: string;
  school_id: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  sport: string | null;
  status: string | null;
  cadence_status: string | null;
  cadence_step: number | null;
  assigned_to_user_id: string | null;
  last_activity_at: string | null;
  updated_at: string | null;
};

type RepProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "(No name)";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json(
      { error: "Admin or Manager access required." },
      { status: 403 }
    );
  }

  const params = await context.params;
  const schoolId = String(params.id || "").trim();

  if (!schoolId) {
    return NextResponse.json({ error: "School id required" }, { status: 400 });
  }

  const { data: school, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name, tier, created_at, updated_at")
    .eq("id", schoolId)
    .maybeSingle();

  if (schoolErr) {
    return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  }

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  const { data: contactRows, error: contactsErr } = await supabaseAdmin
    .from("contacts")
    .select(`
      id,
      school_id,
      first_name,
      last_name,
      primary_email,
      sport,
      status,
      cadence_status,
      cadence_step,
      assigned_to_user_id,
      last_activity_at,
      updated_at
    `)
    .eq("school_id", schoolId)
    .order("updated_at", { ascending: false });

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const contacts = (contactRows ?? []) as ContactRow[];

  const repIds = Array.from(
    new Set(
      contacts
        .map((c) => c.assigned_to_user_id)
        .filter((v): v is string => Boolean(v))
    )
  );

  let repMap = new Map<string, string>();

  if (repIds.length > 0) {
    const { data: repRows, error: repsErr } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, full_name, email")
      .in("user_id", repIds);

    if (repsErr) {
      return NextResponse.json({ error: repsErr.message }, { status: 500 });
    }

    for (const rep of (repRows ?? []) as RepProfileRow[]) {
      repMap.set(rep.user_id, rep.full_name || rep.email || rep.user_id);
    }
  }

  const total_contacts = contacts.length;
  const secured_active_count = contacts.filter((c) => c.status === "Secured/Active").length;
  const do_not_contact_count = contacts.filter(
    (c) => c.status === "Closed/Do Not Contact"
  ).length;
  const new_count = contacts.filter((c) => c.status === "New").length;

  const cadence_contacts = contacts.filter(
    (c) =>
      Number(c.cadence_step || 0) > 0 ||
      ["active", "completed", "stopped"].includes(String(c.cadence_status || ""))
  ).length;

  const active_cadence_count = contacts.filter(
    (c) => String(c.cadence_status || "") === "active"
  ).length;

  const engaged_contacts = contacts.filter(
    (c) =>
      !!c.last_activity_at ||
      Number(c.cadence_step || 0) > 0 ||
      (c.status && c.status !== "New")
  ).length;

  const last_activity_at = contacts
    .map((c) => c.last_activity_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

  const reps_assigned = repIds.map((id) => ({
    user_id: id,
    name: repMap.get(id) || id,
  }));

  const contacts_out = contacts.map((c) => ({
    id: c.id,
    full_name: fullName(c.first_name, c.last_name),
    primary_email: c.primary_email,
    sport: c.sport,
    status: c.status,
    cadence_status: c.cadence_status,
    cadence_step: c.cadence_step ?? 0,
    assigned_to_user_id: c.assigned_to_user_id,
    assigned_to_name: c.assigned_to_user_id ? repMap.get(c.assigned_to_user_id) || c.assigned_to_user_id : null,
    last_activity_at: c.last_activity_at,
    updated_at: c.updated_at,
  }));

  return NextResponse.json({
    data: {
      school,
      metrics: {
        total_contacts,
        rep_count: reps_assigned.length,
        reps_assigned,
        last_activity_at,
        pipeline_penetration_score: pct(engaged_contacts, total_contacts),
        cadence_coverage: pct(cadence_contacts, total_contacts),
        secured_active_count,
        do_not_contact_count,
        new_count,
        active_cadence_count,
      },
      contacts: contacts_out,
    },
  });
}