import { NextResponse } from "next/server";
import { getRole, isPrivileged, requireUser } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ActivityRow = {
  id: string;
  user_id: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string | null;
  outcome: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  manager_user_id: string | null;
  role: string | null;
};

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

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: activities, error: actErr } = await supabaseAdmin
    .from("activities")
    .select("id, user_id, subject, body, occurred_at, outcome")
    .eq("outcome", "onboarding_completed")
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(25);

  if (actErr) {
    return NextResponse.json({ error: actErr.message }, { status: 500 });
  }

  const rows = (activities ?? []) as ActivityRow[];
  const userIds = Array.from(
    new Set(rows.map((r) => String(r.user_id || "")).filter(Boolean))
  );

  let profileMap = new Map<string, ProfileRow>();

  if (userIds.length > 0) {
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, full_name, email, manager_user_id, role")
      .in("user_id", userIds);

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    profileMap = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
    );
  }

  const filtered = rows
    .filter((r) => {
      const actorUserId = String(r.user_id || "");
      const profile = profileMap.get(actorUserId);

      if (!profile) return role === "admin";
      if (role === "admin") return true;
      if (role === "manager") return profile.manager_user_id === me;
      return false;
    })
    .map((r) => {
      const actorUserId = String(r.user_id || "");
      const profile = profileMap.get(actorUserId);

      return {
        id: r.id,
        occurred_at: r.occurred_at,
        subject: r.subject ?? "Rep setup completed",
        body: r.body ?? null,
        rep_user_id: actorUserId || null,
        rep_name: profile?.full_name ?? null,
        rep_email: profile?.email ?? null,
      };
    });

  return NextResponse.json({ data: filtered });
}