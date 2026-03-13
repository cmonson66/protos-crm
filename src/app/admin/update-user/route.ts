import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const user_id = String(body.user_id || "").trim();
    const email = body.email ? String(body.email).trim().toLowerCase() : undefined;
    const full_name = body.full_name ? String(body.full_name).trim() : undefined;
    const role = body.role ? String(body.role).trim() : undefined;
    const is_admin = typeof body.is_admin === "boolean" ? body.is_admin : undefined;

    if (!user_id) {
      return NextResponse.json({ error: "user_id required." }, { status: 400 });
    }

    const patch: any = {};
    if (email !== undefined) patch.email = email || null;
    if (full_name !== undefined) patch.full_name = full_name || null;
    if (role !== undefined) patch.role = role || null;
    if (is_admin !== undefined) patch.is_admin = is_admin;

    const supabaseAdmin = getAdminClient();

    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update(patch)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}