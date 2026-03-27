import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canActorManageTargetUser,
  getRole,
  isPrivileged,
  requireUser,
  type Role,
} from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role: actorRole, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(actorRole)) {
    return NextResponse.json(
      { error: "Admin or Manager access required." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const user_id = String(body.user_id || "").trim();

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, role, is_admin, is_active, full_name, email, manager_user_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!target.email) {
    return NextResponse.json({ error: "Target user has no email address." }, { status: 400 });
  }

  const targetRole: Role = target.is_admin
    ? "admin"
    : ((target.role as Role) || "rep");

  const allowed = await canActorManageTargetUser({
    actorUserId: me,
    actorRole,
    targetUserId: target.user_id,
    targetRole,
    targetIsAdmin: !!target.is_admin,
    targetManagerUserId: target.manager_user_id ?? null,
  });

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          actorRole === "manager"
            ? "Managers can only resend invites for users assigned to them and cannot manage admins."
            : "Forbidden",
      },
      { status: 403 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";

  if (!siteUrl) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_SITE_URL is not configured. Set it to your app base URL.",
      },
      { status: 500 }
    );
  }

  const redirectTo = `${siteUrl.replace(/\/+$/, "")}/auth/callback`;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: target.email,
      options: {
        redirectTo,
      },
    } as any);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin.from("activities").insert({
      contact_id: null,
      user_id: me,
      type: "note",
      occurred_at: new Date().toISOString(),
      subject: "Setup link regenerated",
      body: `Setup link regenerated for ${target.full_name || target.email || target.user_id}.`,
    });

    return NextResponse.json({
      ok: true,
      message: "Fresh setup link generated.",
      action_link: data?.properties?.action_link ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}