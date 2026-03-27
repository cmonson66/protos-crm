import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getRole } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { is_active } = await getRole(auth.user.id);
  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const url = new URL(req.url);
  const vertical = String(url.searchParams.get("vertical") || "").trim();

  let query = supabaseAdmin
    .from("product_catalog")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (vertical) query = query.eq("vertical", vertical);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
