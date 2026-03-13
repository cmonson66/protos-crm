import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabaseRoute";

export async function POST(req: Request) {
  const supabase = await createRouteClient();
  const body = await req.json().catch(() => ({}));

  const contact_id = body.contact_id as string;
  const title = (body.title ?? "").toString().trim();
  const due_at = body.due_at as string; // ISO string
  const notes = (body.notes ?? "").toString().trim();

  if (!contact_id) {
    return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
  }
  if (!due_at) {
    return NextResponse.json({ error: "due_at is required" }, { status: 400 });
  }

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // NOTE: assigned-only RLS should ensure the user can only create for contacts they can access.
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      contact_id,
      assigned_to_user_id: user.id,
      owner_user_id: user.id,
      title: title || null,
      task_type: "follow_up",
      due_at,
      notes: notes || null,
      kind: "manual",
      status: "open",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data });
}