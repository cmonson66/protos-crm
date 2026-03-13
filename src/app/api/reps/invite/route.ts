import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const me = auth.user.id;
  const { role } = await getRole(me);
  if (!isPrivileged(role)) return NextResponse.json({ error: "Admin or Manager access required." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const full_name = String(body.full_name || "").trim() || null;
  const newRole = (String(body.role || "rep").trim() as "admin" | "manager" | "rep");

  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  // Create auth user via invite
  const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  const userId = invited.user?.id;
  if (!userId) return NextResponse.json({ error: "Invite created but no user id returned." }, { status: 500 });

  // Upsert profile
  const is_admin = newRole === "admin";
  const { error: upsertErr } = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        email,
        full_name,
        role: newRole,
        is_admin,
        is_active: true,
      },
      { onConflict: "user_id" }
    );

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}