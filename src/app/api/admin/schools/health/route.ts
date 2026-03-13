import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type SchoolRow = {
  id: string;
  name: string;
  tier: number | null;
};

type ContactSchoolRow = {
  school_id: string | null;
};

function normalizeSchoolText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  const { data: schools, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name, tier")
    .order("name", { ascending: true });

  if (schoolErr) {
    return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  }

  const schoolRows = (schools ?? []) as SchoolRow[];
  const schoolIds = schoolRows.map((s) => s.id);

  let contactCounts = new Map<string, number>();

  if (schoolIds.length > 0) {
    const { data: contacts, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("school_id")
      .in("school_id", schoolIds);

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    for (const row of (contacts ?? []) as ContactSchoolRow[]) {
      if (!row.school_id) continue;
      contactCounts.set(row.school_id, (contactCounts.get(row.school_id) ?? 0) + 1);
    }
  }

  const normalizedGroups = new Map<string, SchoolRow[]>();

  for (const school of schoolRows) {
    const normalized = normalizeSchoolText(school.name);
    if (!normalized) continue;

    const arr = normalizedGroups.get(normalized) ?? [];
    arr.push(school);
    normalizedGroups.set(normalized, arr);
  }

  const duplicateGroups = Array.from(normalizedGroups.values()).filter(
    (group) => group.length > 1
  );

  const schoolsWithNoContacts = schoolRows.filter(
    (s) => (contactCounts.get(s.id) ?? 0) === 0
  ).length;

  const schoolsWith10PlusContacts = schoolRows.filter(
    (s) => (contactCounts.get(s.id) ?? 0) >= 10
  ).length;

  const schoolsWith50PlusContacts = schoolRows.filter(
    (s) => (contactCounts.get(s.id) ?? 0) >= 50
  ).length;

  const topSchools = [...schoolRows]
    .map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      contact_count: contactCounts.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.contact_count - a.contact_count || a.name.localeCompare(b.name))
    .slice(0, 10);

  return NextResponse.json({
    data: {
      total_schools: schoolRows.length,
      duplicate_groups: duplicateGroups.length,
      schools_with_no_contacts: schoolsWithNoContacts,
      schools_with_10_plus_contacts: schoolsWith10PlusContacts,
      schools_with_50_plus_contacts: schoolsWith50PlusContacts,
      top_schools: topSchools,
    },
  });
}