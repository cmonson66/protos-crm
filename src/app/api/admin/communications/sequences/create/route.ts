import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function maybeNull(value: unknown) {
  const v = clean(value);
  return v ? v : null;
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { role, is_active } = await getRole(auth.user.id);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    const payload = {
      key: clean(body.key),
      name: clean(body.name),
      vertical: clean(body.vertical),
      audience_stage: clean(body.audience_stage),
      status: clean(body.status || "draft"),
      description: maybeNull(body.description),
      created_by: auth.user.id,
      updated_by: auth.user.id,
    };

    if (!payload.key || !payload.name || !payload.vertical || !payload.audience_stage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("communication_sequences")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create sequence" },
      { status: 500 }
    );
  }
}