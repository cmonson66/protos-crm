import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getRole, canCreateContact } from "@/lib/apiAuth";

export const runtime = "nodejs";

type SchoolRow = {
  id: string;
  name: string;
  tier: number | null;
};

function normalizeSchoolText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSchoolMatch(name: string, query: string) {
  const normalizedName = normalizeSchoolText(name);
  const normalizedQuery = normalizeSchoolText(query);

  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.startsWith(normalizedQuery)) return 90;
  if (normalizedName.includes(normalizedQuery)) return 75;

  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  const nameWords = normalizedName.split(" ").filter(Boolean);

  const matchedWords = queryWords.filter((word) => nameWords.includes(word)).length;

  if (matchedWords === 0) return 0;

  const coverage = matchedWords / queryWords.length;
  return Math.round(coverage * 50);
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

  if (!canCreateContact(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || 10)));

  if (!q) {
    return NextResponse.json({ data: [] });
  }

  const normalizedQuery = normalizeSchoolText(q);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);

  const searchTerms = Array.from(new Set([q, normalizedQuery, ...queryWords])).filter(Boolean);

  let fetched: SchoolRow[] = [];
  const seen = new Set<string>();

  for (const term of searchTerms.slice(0, 5)) {
    const { data, error } = await supabaseAdmin
      .from("schools")
      .select("id, name, tier")
      .ilike("name", `%${term}%`)
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of (data ?? []) as SchoolRow[]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        fetched.push(row);
      }
    }
  }

  const ranked = fetched
    .map((row) => ({
      ...row,
      _score: scoreSchoolMatch(row.name, q),
    }))
    .filter((row) => row._score > 0)
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map(({ _score, ...row }) => row);

  return NextResponse.json({ data: ranked });
}