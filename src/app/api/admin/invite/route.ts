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

    // caller must be logged in
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // caller must be admin or manager
    const { data: canManage, error: cmErr } = await supa.rpc("can_manage_reps");
    if (cmErr) return NextResponse.json({ error: cmErr.message }, { status: 403 });
    if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const full_name = String(body?.full_name ?? "").trim();
    const role = String(body?.role ?? "rep").trim(); // rep | manager
    const is_admin = Boolean(body?.is_admin ?? false);

    if (!email.includes("@")) return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    if (!["rep", "manager", "admin"].includes(is_admin ? "admin" : role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    // Invite user in auth
    const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

    const user_id = invited.user?.id;
    if (!user_id) return NextResponse.json({ error: "Invite failed." }, { status: 500 });

    // Upsert profile
    const { error: upErr } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          user_id,
          email,
          full_name: full_name || null,
          role: is_admin ? "admin" : role,
          is_admin,
          is_active: true,
        },
        { onConflict: "user_id" }
      );

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, user_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}