import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();

  if (!q) {
    return NextResponse.json({ data: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("accounts")
    .select(`
      id,
      name,
      industry,
      company_size,
      hq_location,
      website,
      active
    `)
    .ilike("name", `%${q}%`)
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}