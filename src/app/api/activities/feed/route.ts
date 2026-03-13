import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 200);
    const contactId = (url.searchParams.get("contact_id") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    let query = supabase
      .from("activities")
      .select(
        `
        id,
        contact_id,
        user_id,
        type,
        occurred_at,
        subject,
        body,
        outcome,
        created_at,
        contacts(
          id,
          first_name,
          last_name,
          primary_email,
          status,
          schools(name)
        )
      `
      )
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (contactId) query = query.eq("contact_id", contactId);

    // Basic search: subject/body contains q (and contact email if you want)
    if (q) {
      query = query.or(`subject.ilike.%${q}%,body.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}