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
    return NextResponse.json({ error: "Admin or Manager access required." }, { status: 403 });
  }

  const { data: schools, error: schoolErr } = await supabaseAdmin
    .from("schools")
    .select("id, name, tier, created_at, updated_at")
    .order("name", { ascending: true });

  if (schoolErr) {
    return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  }

  const schoolRows = (schools ?? []) as SchoolRow[];
  const schoolIds = schoolRows.map((s) => s.id);

  let contactCounts = new Map<string, number>();

  if (schoolIds.length > 0) {
    const { data: contactRows, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("school_id")
      .in("school_id", schoolIds);

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    for (const row of (contactRows ?? []) as ContactSchoolRow[]) {
      if (!row.school_id) continue;
      contactCounts.set(row.school_id, (contactCounts.get(row.school_id) ?? 0) + 1);
    }
  }

  const grouped = new Map<string, SchoolRow[]>();

  for (const school of schoolRows) {
    const normalized = normalizeSchoolText(school.name);
    if (!normalized) continue;

    const arr = grouped.get(normalized) ?? [];
    arr.push(school);
    grouped.set(normalized, arr);
  }

  const duplicateGroups = Array.from(grouped.entries())
    .map(([normalized_name, schools]) => {
      if (schools.length < 2) return null;

      const schoolsWithCounts = schools.map((school) => ({
        ...school,
        contact_count: contactCounts.get(school.id) ?? 0,
      }));

      const sorted = [...schoolsWithCounts].sort((a, b) => {
        if (b.contact_count !== a.contact_count) return b.contact_count - a.contact_count;
        if ((a.name || "").length !== (b.name || "").length) return (a.name || "").length - (b.name || "").length;
        return (a.name || "").localeCompare(b.name || "");
      });

      const target = sorted[0];

      return {
        normalized_name,
        target_school_id: target.id,
        target_school_name: target.name,
        total_contacts: sorted.reduce((sum, s) => sum + s.contact_count, 0),
        schools: sorted,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (b.schools.length !== a.schools.length) return b.schools.length - a.schools.length;
      return b.total_contacts - a.total_contacts;
    });

  return NextResponse.json({
    data: duplicateGroups,
    total_groups: duplicateGroups.length,
  });
}