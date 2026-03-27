import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

type AppRole = "admin" | "manager" | "rep";

async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find(
      (u) => String(u.email || "").trim().toLowerCase() === email
    );

    if (match) return match;
    if (users.length < perPage) return null;

    page += 1;
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json(
      { error: "Admin or Manager access required." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const full_name = String(body.full_name || "").trim() || null;
  const newRole = String(body.role || "rep").trim() as AppRole;
  const requestedManagerUserId = String(body.manager_user_id || "").trim() || null;

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  if (!["admin", "manager", "rep"].includes(newRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (role === "manager" && newRole === "admin") {
    return NextResponse.json(
      { error: "Managers cannot create admins." },
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

  const managerUserId =
    role === "admin"
      ? requestedManagerUserId
      : role === "manager"
        ? me
        : null;

  const is_admin = newRole === "admin";

  try {
    const { data: invited, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          full_name: full_name ?? "",
        },
      });

    if (inviteErr) {
      const lowerMsg = String(inviteErr.message || "").toLowerCase();

      if (
        lowerMsg.includes("already been registered") ||
        lowerMsg.includes("already registered") ||
        lowerMsg.includes("email rate limit exceeded")
      ) {
        const existingAuthUser = await findAuthUserByEmail(email);

        if (!existingAuthUser?.id) {
          if (lowerMsg.includes("email rate limit exceeded")) {
            return NextResponse.json(
              {
                error:
                  "Email sending is temporarily rate-limited. Wait a few minutes, or use Resend Invite on an existing user.",
              },
              { status: 429 }
            );
          }

          return NextResponse.json(
            { error: inviteErr.message },
            { status: 500 }
          );
        }

        const { error: upsertErr } = await supabaseAdmin
          .from("user_profiles")
          .upsert(
            {
              user_id: existingAuthUser.id,
              email,
              full_name,
              role: newRole,
              is_admin,
              is_active: true,
              manager_user_id: is_admin ? null : managerUserId,
            },
            { onConflict: "user_id" }
          );

        if (upsertErr) {
          return NextResponse.json({ error: upsertErr.message }, { status: 500 });
        }

        const { data: recoveryData, error: recoveryErr } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email,
            options: {
              redirectTo,
            },
          } as any);

        if (recoveryErr) {
          return NextResponse.json({ error: recoveryErr.message }, { status: 500 });
        }

        return NextResponse.json({
          ok: true,
          existing_user: true,
          message:
            "Existing auth user found. A fresh setup link was generated instead of sending a new invite.",
          action_link: recoveryData?.properties?.action_link ?? null,
        });
      }

      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }

    const userId = invited.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Invite created but no user id returned." },
        { status: 500 }
      );
    }

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
          manager_user_id: is_admin ? null : managerUserId,
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      invited: true,
      message: "Invite email sent.",
      redirectTo,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}