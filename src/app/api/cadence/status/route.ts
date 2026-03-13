import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type CadenceBannerState =
  | "inactive"
  | "scheduled"
  | "due"
  | "overdue"
  | "broken";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const contact_id = (url.searchParams.get("contact_id") || "").trim();

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id required" }, { status: 400 });
    }

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

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select(`
        id,
        status,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at
      `)
      .eq("id", contact_id)
      .maybeSingle();

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 400 });
    }

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const cadenceKey = String(contact.cadence_key || "").trim();
    const cadenceStatus = String(contact.cadence_status || "").trim().toLowerCase();
    const cadenceStep = Number(contact.cadence_step || 0);
    const dueRaw = contact.cadence_next_due_at ? String(contact.cadence_next_due_at) : null;

    if (!cadenceKey || cadenceStatus !== "active" || cadenceStep < 1) {
      return NextResponse.json({
        state: "inactive" satisfies CadenceBannerState,
        message: "No active cadence",
      });
    }

    if (!dueRaw) {
      return NextResponse.json({
        state: "broken" satisfies CadenceBannerState,
        message: "Cadence is active but missing next due date",
      });
    }

    const due = new Date(dueRaw);
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({
        state: "broken" satisfies CadenceBannerState,
        message: "Cadence due date is invalid",
      });
    }

    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffMinutes = Math.floor(Math.abs(diffMs) / 60000);

    if (diffMs > 0) {
      return NextResponse.json({
        state: "scheduled" satisfies CadenceBannerState,
        message: `Next step scheduled for ${due.toLocaleString()}`,
        due_at: due.toISOString(),
      });
    }

    if (diffMinutes >= 1) {
      return NextResponse.json({
        state: "overdue" satisfies CadenceBannerState,
        message: `Cadence step overdue by ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`,
        due_at: due.toISOString(),
        minutes_overdue: diffMinutes,
      });
    }

    return NextResponse.json({
      state: "due" satisfies CadenceBannerState,
      message: "Cadence step due now",
      due_at: due.toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}