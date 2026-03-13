import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Admin or Manager access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const target_school_id = String(body.target_school_id || "").trim();
  const source_school_ids = Array.isArray(body.source_school_ids)
    ? body.source_school_ids.map((x: unknown) => String(x || "").trim()).filter(Boolean)
    : [];

  if (!target_school_id) {
    return NextResponse.json({ error: "target_school_id is required" }, { status: 400 });
  }

  if (source_school_ids.length === 0) {
    return NextResponse.json({ error: "At least one source school is required" }, { status: 400 });
  }

  if (source_school_ids.includes(target_school_id)) {
    return NextResponse.json(
      { error: "Target school cannot also be in source_school_ids" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc("merge_schools", {
    p_target_school_id: target_school_id,
    p_source_school_ids: source_school_ids,
    p_actor_user_id: me,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    result: data,
  });
}