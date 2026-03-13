import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getRole, canCreateContact } from "@/lib/apiAuth";

export const runtime = "nodejs";

type SchoolRow = {
  id: string;
  name: string;
  tier: number | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSchoolText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findExistingSchoolByNormalizedName(name: string) {
  const normalizedTarget = normalizeSchoolText(name);
  if (!normalizedTarget) return null;

  const words = normalizedTarget.split(" ").filter(Boolean);
  const searchTerms = Array.from(new Set([name, normalizedTarget, ...words])).filter(Boolean);

  const seen = new Set<string>();
  const candidates: SchoolRow[] = [];

  for (const term of searchTerms.slice(0, 5)) {
    const { data, error } = await supabaseAdmin
      .from("schools")
      .select("id, name, tier")
      .ilike("name", `%${term}%`)
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as SchoolRow[]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push(row);
      }
    }
  }

  const exactNormalized = candidates.find(
    (row) => normalizeSchoolText(row.name) === normalizedTarget
  );

  return exactNormalized ?? null;
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
  const name = clean(body.name);
  const tier =
    body.tier === null || body.tier === undefined || body.tier === ""
      ? null
      : Number(body.tier);

  if (!name) {
    return NextResponse.json({ error: "School name is required." }, { status: 400 });
  }

  if (tier !== null && !Number.isInteger(tier)) {
    return NextResponse.json({ error: "Tier must be a whole number." }, { status: 400 });
  }

  try {
    const existing = await findExistingSchoolByNormalizedName(name);

    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        existing: true,
        school: existing,
        message: "Existing school matched and reused.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("schools")
      .insert({
        name,
        tier,
      })
      .select("id, name, tier")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      created: true,
      existing: false,
      school: data,
      message: "School created.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create school." },
      { status: 500 }
    );
  }
}