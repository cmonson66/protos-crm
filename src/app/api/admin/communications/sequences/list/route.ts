import { NextResponse } from "next/server";
import { requireUser, getRole, isPrivileged } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { CommunicationSequence } from "@/lib/communications/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const vertical = (url.searchParams.get("vertical") || "").trim();
  const audienceStage = (url.searchParams.get("audience_stage") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();

  let query = supabaseAdmin
    .from("communication_sequences")
    .select("*")
    .order("vertical", { ascending: true })
    .order("audience_stage", { ascending: true })
    .order("key", { ascending: true });

  if (vertical) query = query.eq("vertical", vertical);
  if (audienceStage) query = query.eq("audience_stage", audienceStage);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: (data ?? []) as CommunicationSequence[] });
}