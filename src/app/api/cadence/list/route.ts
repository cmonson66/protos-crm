import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type CadenceListRow = {
  sequence_id: string;
  cadence_key: string;
  cadence_name: string;
  vertical: "athletics" | "corporate";
  audience_stage: "new" | "secured_active";
  sequence_status: "draft" | "active" | "archived";
  updated_at: string | null;
};

export async function GET(req: Request) {
  const auth = await requireUser(req);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const vertical = (url.searchParams.get("vertical") || "").trim().toLowerCase();

  let query = supabaseAdmin
    .from("v_active_prospecting_sequences")
    .select(`
      sequence_id,
      cadence_key,
      cadence_name,
      vertical,
      audience_stage,
      sequence_status,
      updated_at
    `)
    .eq("audience_stage", "new")
    .eq("sequence_status", "active")
    .order("vertical", { ascending: true })
    .order("cadence_name", { ascending: true });

  if (vertical === "athletics" || vertical === "corporate") {
    query = query.eq("vertical", vertical);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as CadenceListRow[];

  const result = rows.map((row) => ({
    key: row.cadence_key,
    name: row.cadence_name || row.cadence_key,
    vertical: row.vertical === "corporate" ? "corporate" : "athletics",
    is_active: row.sequence_status === "active",
    updated_at: row.updated_at ?? null,
  }));

  return NextResponse.json({ data: result });
}