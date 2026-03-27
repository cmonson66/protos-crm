import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type PriorityRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  sport: string | null;
  status: string;
  cadence_status: string | null;
  cadence_step: number | null;
  assigned_to_user_id: string | null;
  last_activity_at: string | null;
  updated_at: string | null;
  school_name?: string | null;
  school_tier?: number | null;
  priority_score?: number | null;
};

type TaskRow = {
  id: string;
  contact_id: string;
  title: string | null;
  notes: string | null;
  task_type: string;
  due_at: string;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  assigned_to_user_id: string | null;
};

function fullName(row: { first_name?: string | null; last_name?: string | null }) {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "(No name)";
}

function classifyUrgency(dueAt: string | null) {
  if (!dueAt) return "unscheduled";
  const dueMs = new Date(dueAt).getTime();
  const now = Date.now();

  if (Number.isNaN(dueMs)) return "unscheduled";
  if (dueMs <= now) return "due_now";

  const diffHours = (dueMs - now) / (1000 * 60 * 60);
  if (diffHours <= 24) return "due_today";
  return "upcoming";
}

function isRadarPromotion(task: { title?: string | null; notes?: string | null }) {
  const title = String(task.title || "").toLowerCase();
  const notes = String(task.notes || "").toLowerCase();

  return (
    title.startsWith("work now:") ||
    notes.includes("queue_source=radar_promotion") ||
    notes.includes("promoted from priority radar")
  );
}

function queueRank(args: {
  priorityScore: number;
  dueAt: string | null;
  kind: string;
  cadenceStep: number | null;
  cadenceStatus: string | null;
  title?: string | null;
  notes?: string | null;
}) {
  const urgency = classifyUrgency(args.dueAt);

  let urgencyBoost = 0;
  if (urgency === "due_now") urgencyBoost = 40;
  else if (urgency === "due_today") urgencyBoost = 20;
  else if (urgency === "upcoming") urgencyBoost = 5;

  let kindBoost = 0;
  if (args.kind === "cadence") kindBoost = 15;
  else if (args.kind === "manual") kindBoost = 8;

  let cadenceBoost = 0;
  if (args.cadenceStatus === "active") cadenceBoost = 10;
  if ((args.cadenceStep ?? 0) >= 3) cadenceBoost += 5;

  const promotionBoost = isRadarPromotion({
    title: args.title,
    notes: args.notes,
  })
    ? 1000
    : 0;

  return args.priorityScore + urgencyBoost + kindBoost + cadenceBoost + promotionBoost;
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const me = auth.user.id;
    const { role, is_active } = await getRole(me);

    if (!is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
    const dueOnly = (url.searchParams.get("due_only") || "0") === "1";

    const isAdmin = role === "admin" || role === "manager";

    const { data: priorityRows, error: priorityErr } = await supabaseAdmin.rpc("contact_priority_scores_v2");

    if (priorityErr) {
      return NextResponse.json({ error: priorityErr.message }, { status: 500 });
    }

    const priorityList = ((priorityRows ?? []) as PriorityRow[]).filter((r) =>
      isAdmin ? true : r.assigned_to_user_id === me
    );

    const priorityByContactId = new Map<
      string,
      {
        contact_id: string;
        full_name: string;
        school_name: string | null;
        primary_email: string | null;
        sport: string | null;
        status: string;
        cadence_status: string | null;
        cadence_step: number | null;
        assigned_to_user_id: string | null;
        last_activity_at: string | null;
        updated_at: string | null;
        priority_score: number;
        school_tier: number | null;
      }
    >();

    for (const row of priorityList) {
      priorityByContactId.set(row.id, {
        contact_id: row.id,
        full_name: fullName(row),
        school_name: row.school_name ?? null,
        primary_email: row.primary_email ?? null,
        sport: row.sport ?? null,
        status: row.status,
        cadence_status: row.cadence_status ?? null,
        cadence_step: row.cadence_step ?? 0,
        assigned_to_user_id: row.assigned_to_user_id ?? null,
        last_activity_at: row.last_activity_at ?? null,
        updated_at: row.updated_at ?? null,
        priority_score: Number(row.priority_score ?? 0),
        school_tier: row.school_tier ?? null,
      });
    }

    const { data: tasksRaw, error: tasksErr } = await supabaseAdmin
      .from("tasks")
      .select(`
        id,
        contact_id,
        title,
        notes,
        task_type,
        due_at,
        status,
        kind,
        cadence_key,
        cadence_step,
        assigned_to_user_id
      `)
      .is("completed_at", null)
      .order("due_at", { ascending: true });

    if (tasksErr) {
      return NextResponse.json({ error: tasksErr.message }, { status: 500 });
    }

    const openTasks = ((tasksRaw ?? []) as TaskRow[]).filter((t) =>
      isAdmin ? true : t.assigned_to_user_id === me
    );

    const items = openTasks
      .map((task) => {
        const c = priorityByContactId.get(task.contact_id);
        if (!c) return null;

        const urgency = classifyUrgency(task.due_at);
        if (dueOnly && urgency !== "due_now" && urgency !== "due_today") return null;

        const rank = queueRank({
          priorityScore: c.priority_score,
          dueAt: task.due_at,
          kind: task.kind,
          cadenceStep: task.cadence_step ?? null,
          cadenceStatus: c.cadence_status,
          title: task.title,
          notes: task.notes,
        });

        return {
          task_id: task.id,
          contact_id: c.contact_id,
          full_name: c.full_name,
          school_name: c.school_name,
          primary_email: c.primary_email,
          sport: c.sport,
          contact_status: c.status,
          cadence_status: c.cadence_status,
          cadence_step: c.cadence_step,
          assigned_to_user_id: c.assigned_to_user_id,
          task_title: task.title,
          task_notes: task.notes,
          task_type: task.task_type,
          task_kind: task.kind,
          task_due_at: task.due_at,
          urgency,
          priority_score: c.priority_score,
          queue_rank: rank,
          school_tier: c.school_tier,
          last_activity_at: c.last_activity_at,
          updated_at: c.updated_at,
          is_radar_promotion: isRadarPromotion({
            title: task.title,
            notes: task.notes,
          }),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const rankDiff = Number(b.queue_rank || 0) - Number(a.queue_rank || 0);
        if (rankDiff !== 0) return rankDiff;

        const dueA = a.task_due_at ? new Date(a.task_due_at).getTime() : Number.MAX_SAFE_INTEGER;
        const dueB = b.task_due_at ? new Date(b.task_due_at).getTime() : Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;

        const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return updatedB - updatedA;
      })
      .slice(0, limit);

    const summary = {
      total_open_items: items.length,
      due_now: items.filter((i: any) => i.urgency === "due_now").length,
      due_today: items.filter((i: any) => i.urgency === "due_today").length,
      upcoming: items.filter((i: any) => i.urgency === "upcoming").length,
      cadence_items: items.filter((i: any) => i.task_kind === "cadence").length,
      manual_items: items.filter((i: any) => i.task_kind === "manual").length,
      radar_promotions: items.filter((i: any) => i.is_radar_promotion).length,
    };

    return NextResponse.json({
      data: items,
      summary,
      limit,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}