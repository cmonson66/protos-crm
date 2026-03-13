import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type CadenceListRow = {
  cadence_key: string;
  step: number;
  name: string | null;
  subject: string | null;
  vertical: "coaching" | "corporate" | null;
  is_active: boolean | null;
  updated_at: string | null;
};

export async function GET(req: Request) {
  const auth = await requireUser(req);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("cadence_template_steps")
    .select(`
      cadence_key,
      step,
      name,
      subject,
      vertical,
      is_active,
      updated_at
    `)
    .eq("is_active", true)
    .order("cadence_key", { ascending: true })
    .order("step", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as CadenceListRow[];

  const seen = new Set<string>();
  const result: {
    key: string;
    name: string;
    vertical: "coaching" | "corporate";
    is_active: boolean;
    updated_at: string | null;
  }[] = [];

  for (const row of rows) {
    if (seen.has(row.cadence_key)) continue;
    seen.add(row.cadence_key);

    result.push({
      key: row.cadence_key,
      name:
        row.name?.trim() ||
        row.subject?.trim() ||
        row.cadence_key,
      vertical: row.vertical === "corporate" ? "corporate" : "coaching",
      is_active: true,
      updated_at: row.updated_at ?? null,
    });
  }

  return NextResponse.json({ data: result });
}