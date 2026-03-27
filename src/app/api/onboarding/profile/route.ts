import { NextResponse } from "next/server";
import { requireUser, getRole } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ProfileRole = "admin" | "manager" | "rep";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

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

  const { data: profile, error } = await supabaseAdmin
    .from("user_profiles")
    .select(`
      user_id,
      email,
      full_name,
      role,
      is_active,
      phone,
      job_title,
      region,
      timezone,
      avatar_url,
      onboarding_completed_at,
      onboarding_notes,
      manager_user_id
    `)
    .eq("user_id", me)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    user_id: me,
    email: profile?.email ?? auth.user.email ?? null,
    full_name: profile?.full_name ?? null,
    role: ((profile?.role as ProfileRole) || role) as ProfileRole,
    is_active,
    phone: profile?.phone ?? null,
    job_title: profile?.job_title ?? null,
    region: profile?.region ?? null,
    timezone: profile?.timezone ?? null,
    avatar_url: profile?.avatar_url ?? null,
    onboarding_completed_at: profile?.onboarding_completed_at ?? null,
    onboarding_notes: profile?.onboarding_notes ?? null,
    manager_user_id: profile?.manager_user_id ?? null,
  });
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

  const body = await req.json().catch(() => ({}));

  const full_name = clean(body.full_name);
  const phone = maybeNull(body.phone);
  const job_title = maybeNull(body.job_title);
  const region = maybeNull(body.region);
  const timezone = maybeNull(body.timezone);
  const avatar_url = maybeNull(body.avatar_url);
  const onboarding_notes = maybeNull(body.onboarding_notes);

  if (!full_name) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  }

  const email = auth.user.email?.trim().toLowerCase() || null;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("user_profiles")
    .select("manager_user_id")
    .eq("user_id", me)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      {
        user_id: me,
        email,
        full_name,
        role,
        is_admin: role === "admin",
        is_active: true,
        phone,
        job_title,
        region,
        timezone,
        avatar_url,
        onboarding_notes,
        onboarding_completed_at: new Date().toISOString(),
        manager_user_id: existing?.manager_user_id ?? null,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}