import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type SchoolRow = {
  id: string;
  name: string;
  tier: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

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

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const sort_by = String(url.searchParams.get("sort_by") || "contacts").trim();
  const sort_dir = String(url.searchParams.get("sort_dir") || "desc").trim().toLowerCase();

  const { data: schools, error: schoolsErr } = await supabaseAdmin
    .from("schools")
    .select("id, name, tier, created_at, updated_at")
    .order("name", { ascending: true });

  if (schoolsErr) {
    return NextResponse.json({ error: schoolsErr.message }, { status: 500 });
  }

  const schoolRows = (schools ?? []) as SchoolRow[];
  const schoolIds = schoolRows.map((s) => s.id);

  let contacts: ContactRow[] = [];

  if (schoolIds.length > 0) {
    const { data: contactData, error: contactsErr } = await supabaseAdmin
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
      .in("school_id", schoolIds);

    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    contacts = (contactData ?? []) as ContactRow[];
  }

  const assignedUserIds = Array.from(
    new Set(
      contacts
        .map((c) => c.assigned_to_user_id)
        .filter((v): v is string => Boolean(v))
    )
  );

  let repMap = new Map<string, string>();

  if (assignedUserIds.length > 0) {
    const { data: repRows, error: repsErr } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, full_name, email")
      .in("user_id", assignedUserIds);

    if (repsErr) {
      return NextResponse.json({ error: repsErr.message }, { status: 500 });
    }

    for (const rep of (repRows ?? []) as RepProfileRow[]) {
      repMap.set(rep.user_id, rep.full_name || rep.email || rep.user_id);
    }
  }

  const rows = schoolRows.map((school) => {
    const schoolContacts = contacts.filter((c) => c.school_id === school.id);

    const total_contacts = schoolContacts.length;
    const secured_active_count = schoolContacts.filter((c) => c.status === "Secured/Active").length;
    const do_not_contact_count = schoolContacts.filter(
      (c) => c.status === "Closed/Do Not Contact"
    ).length;
    const new_count = schoolContacts.filter((c) => c.status === "New").length;

    const cadence_contacts = schoolContacts.filter(
      (c) =>
        Number(c.cadence_step || 0) > 0 ||
        ["active", "completed", "stopped"].includes(String(c.cadence_status || ""))
    ).length;

    const active_cadence_count = schoolContacts.filter(
      (c) => String(c.cadence_status || "") === "active"
    ).length;

    const engaged_contacts = schoolContacts.filter(
      (c) =>
        !!c.last_activity_at ||
        Number(c.cadence_step || 0) > 0 ||
        (c.status && c.status !== "New")
    ).length;

    const pipeline_penetration_score = pct(engaged_contacts, total_contacts);
    const cadence_coverage = pct(cadence_contacts, total_contacts);

    const repIds = Array.from(
      new Set(
        schoolContacts
          .map((c) => c.assigned_to_user_id)
          .filter((v): v is string => Boolean(v))
      )
    );

    const reps_assigned = repIds.map((id) => ({
      user_id: id,
      name: repMap.get(id) || id,
    }));

    const last_activity_at = schoolContacts
      .map((c) => c.last_activity_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

    const recent_contacts = [...schoolContacts]
      .sort((a, b) => {
        const av = a.last_activity_at || a.updated_at || "";
        const bv = b.last_activity_at || b.updated_at || "";
        return new Date(bv).getTime() - new Date(av).getTime();
      })
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        full_name: fullName(c.first_name, c.last_name),
        primary_email: c.primary_email,
        sport: c.sport,
        status: c.status,
        cadence_status: c.cadence_status,
        last_activity_at: c.last_activity_at,
      }));

    return {
      id: school.id,
      name: school.name,
      tier: school.tier,
      total_contacts,
      reps_assigned,
      rep_count: reps_assigned.length,
      last_activity_at,
      pipeline_penetration_score,
      cadence_coverage,
      secured_active_count,
      do_not_contact_count,
      new_count,
      active_cadence_count,
      recent_contacts,
    };
  });

  const filtered = rows.filter((row) => {
    if (!q) return true;

    const repText = row.reps_assigned.map((r) => r.name.toLowerCase()).join(" ");
    return (
      row.name.toLowerCase().includes(q) ||
      String(row.tier ?? "").includes(q) ||
      repText.includes(q)
    );
  });

  filtered.sort((a, b) => {
    let result = 0;

    switch (sort_by) {
      case "name":
        result = a.name.localeCompare(b.name);
        break;
      case "tier":
        result = (a.tier ?? 0) - (b.tier ?? 0);
        break;
      case "penetration":
        result = a.pipeline_penetration_score - b.pipeline_penetration_score;
        break;
      case "cadence_coverage":
        result = a.cadence_coverage - b.cadence_coverage;
        break;
      case "last_activity":
        result =
          new Date(a.last_activity_at || 0).getTime() -
          new Date(b.last_activity_at || 0).getTime();
        break;
      case "contacts":
      default:
        result = a.total_contacts - b.total_contacts;
        break;
    }

    return sort_dir === "asc" ? result : -result;
  });

  return NextResponse.json({ data: filtered });
}