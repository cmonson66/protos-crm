import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);
  if (!is_active) return NextResponse.json({ error: "User inactive" }, { status: 403 });

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  // enforce assigned-only by verifying the contact first
  if (!isPrivileged(role)) {
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("id,assigned_to_user_id")
      .eq("id", contactId)
      .maybeSingle();

    if (!c || c.assigned_to_user_id !== me) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("contact_id", contactId)
    .order("due_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}