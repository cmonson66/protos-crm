import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getManagerScopeUserIds, getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

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

  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const vertical = String(url.searchParams.get("vertical") || "").trim();
  const sales_stage_key = String(url.searchParams.get("sales_stage_key") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  const assigned_to_user_id = String(url.searchParams.get("assigned_to_user_id") || "").trim();
  const primary_contact_id = String(url.searchParams.get("primary_contact_id") || "").trim();

  let query = supabaseAdmin
    .from("v_opportunities_enriched")
    .select("*")
    .order("updated_at", { ascending: false });

  if (vertical) query = query.eq("vertical", vertical);
  if (sales_stage_key) query = query.eq("sales_stage_key", sales_stage_key);
  if (status) query = query.eq("status", status);
  if (primary_contact_id) query = query.eq("primary_contact_id", primary_contact_id);

  const scopeUserIds = await getManagerScopeUserIds(me, role);

  if (role === "rep") {
    query = query.eq("assigned_to_user_id", me);
  } else if (role === "manager") {
    query = query.in("assigned_to_user_id", scopeUserIds);
  }

  if (assigned_to_user_id) {
    if (role === "admin") {
      query = query.eq("assigned_to_user_id", assigned_to_user_id);
    } else if (scopeUserIds.includes(assigned_to_user_id)) {
      query = query.eq("assigned_to_user_id", assigned_to_user_id);
    } else {
      return NextResponse.json({ data: [] });
    }
  }

  if (q) {
    query = query.or(
      [
        `name.ilike.%${q}%`,
        `description.ilike.%${q}%`,
        `school_name.ilike.%${q}%`,
        `account_name.ilike.%${q}%`,
        `contact_first_name.ilike.%${q}%`,
        `contact_last_name.ilike.%${q}%`,
        `contact_primary_email.ilike.%${q}%`,
        `product_family.ilike.%${q}%`,
        `product_name.ilike.%${q}%`,
        `custom_product_name.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}