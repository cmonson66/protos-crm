import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canCreateContact, getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

function normalizeAccountName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  if (!canCreateContact(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const name = clean(body.name);
  const industry = maybeNull(body.industry);
  const company_size = maybeNull(body.company_size);
  const hq_location = maybeNull(body.hq_location);
  const website = maybeNull(body.website);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const normalizedInput = normalizeAccountName(name);

  const { data: existingRows, error: existingErr } = await supabaseAdmin
    .from("accounts")
    .select(`
      id,
      name,
      industry,
      company_size,
      hq_location,
      website,
      active
    `)
    .eq("active", true)
    .limit(200);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const existing =
    (existingRows ?? []).find(
      (row) => normalizeAccountName(row.name) === normalizedInput
    ) ?? null;

  if (existing) {
    return NextResponse.json({
      ok: true,
      created: false,
      account: existing,
    });
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("accounts")
    .insert({
      name,
      industry,
      company_size,
      hq_location,
      website,
      active: true,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(`
      id,
      name,
      industry,
      company_size,
      hq_location,
      website,
      active
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    created: true,
    account: data,
  });
}