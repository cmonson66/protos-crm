import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const { count, error: countErr } = await supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  const { data: latest, error: latestErr } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, primary_email, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (latestErr) {
    return NextResponse.json({ error: latestErr.message }, { status: 500 });
  }

  return NextResponse.json({
    total_contacts: count ?? 0,
    latest: latest ?? [],
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  });
}