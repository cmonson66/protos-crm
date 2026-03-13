import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function supabaseAuthed(authHeader: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supa = supabaseAuthed(authHeader);

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: canManage, error: cmErr } = await supa.rpc("can_manage_reps");
    if (cmErr) return NextResponse.json({ error: cmErr.message }, { status: 403 });
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const user_id = String(body?.user_id ?? "").trim();
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

    const patch: any = {};
    if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase() || null;
    if (typeof body.full_name === "string") patch.full_name = body.full_name.trim() || null;

    if (typeof body.is_admin === "boolean") {
      patch.is_admin = body.is_admin;
      patch.role = body.is_admin ? "admin" : (body.role ?? "rep");
    } else if (typeof body.role === "string") {
      patch.role = body.role.trim();
    }

    // validate role
    if (patch.role && !["rep", "manager", "admin"].includes(patch.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("user_profiles").update(patch).eq("user_id", user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}