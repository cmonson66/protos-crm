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
    const email = String(body.email || "").trim().toLowerCase();
    const full_name = String(body.full_name || "").trim();
    const is_admin = Boolean(body.is_admin);
    const role = String(body.role || (is_admin ? "admin" : "rep")).trim();

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // Invite user (email-based). They set their password via the invite flow.
    const { data: invited, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const userId = invited.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Invite succeeded but no user id returned." }, { status: 500 });
    }

    // Upsert profile row (server bypasses RLS using service role)
    const { error: upsertError } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          user_id: userId,
          email,
          full_name: full_name || null,
          is_admin,
          role,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user_id: userId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}