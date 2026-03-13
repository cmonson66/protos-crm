import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser, isPrivileged } from "@/lib/apiAuth";

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

  const body = await req.json().catch(() => ({}));
  const contact_id = String(body.contact_id || "").trim();
  const cadence_key = String(body.cadence_key || "").trim();
  const cadence_step = Number(body.cadence_step || 0);

  if (!contact_id || !cadence_key || !cadence_step) {
    return NextResponse.json(
      { error: "contact_id, cadence_key, and cadence_step are required" },
      { status: 400 }
    );
  }

  // Load contact for access control
  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("id, assigned_to_user_id, owner_user_id")
    .eq("id", contact_id)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!isPrivileged(role) && contact.assigned_to_user_id !== me) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find exact open cadence task on the server
  const { data: task, error: taskErr } = await supabaseAdmin
    .from("tasks")
    .select(`
      id,
      contact_id,
      assigned_to_user_id,
      owner_user_id,
      kind,
      cadence_key,
      cadence_step,
      status,
      completed_at
    `)
    .eq("contact_id", contact_id)
    .eq("kind", "cadence")
    .eq("cadence_key", cadence_key)
    .eq("cadence_step", cadence_step)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (taskErr) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }

  if (!task) {
    return NextResponse.json(
      {
        error: `No open cadence task found for ${cadence_key} step ${cadence_step}`,
      },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabaseAdmin
    .from("tasks")
    .update({
      completed_at: now,
      status: "closed",
    })
    .eq("id", task.id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: advErr } = await supabaseAdmin.rpc("cadence_advance_from_task", {
    p_task_id: task.id,
  });

  if (advErr) {
    return NextResponse.json(
      {
        error: advErr.message,
        details: advErr.details ?? null,
        hint: advErr.hint ?? null,
        code: advErr.code ?? null,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, task_id: task.id });
}