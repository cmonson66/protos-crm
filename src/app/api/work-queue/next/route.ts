import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

type Vertical = "athletics" | "corporate";

type PriorityRow = {
  id: string;
  assigned_to_user_id: string | null;
  cadence_status: string | null;
  priority_score?: number | null;
};

type ContactRelation = {
  id: string;
  vertical: Vertical | "coaching";
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  job_title_raw: string | null;
  sport: string | null;
  assigned_to_user_id?: string | null;
  owner_user_id?: string | null;
  schools: { name: string | null }[] | null;
  accounts: { name: string | null }[] | null;
};

type RawTaskRow = {
  id: string;
  due_at: string;
  title: string | null;
  notes: string | null;
  task_type: string;
  status: string | null;
  kind: string;
  cadence_key: string | null;
  cadence_step: number | null;
  contact_id: string;
  assigned_to_user_id?: string | null;
  owner_user_id?: string | null;
  contacts: ContactRelation[] | null;
};

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

function normalizeVertical(v: Vertical | "coaching" | null | undefined): Vertical {
  return v === "corporate" ? "corporate" : "athletics";
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

    const isAdmin = role === "admin" || role === "manager";

    const url = new URL(req.url);
    const excludeTaskId = String(url.searchParams.get("exclude_task_id") || "").trim();
    const taskId = String(url.searchParams.get("task_id") || "").trim();

    const { data: priorityRows, error: priorityErr } = await supabaseAdmin.rpc(
      "contact_priority_scores_v2"
    );

    if (priorityErr) {
      return NextResponse.json({ error: priorityErr.message }, { status: 500 });
    }

    const priorityByContactId = new Map<
      string,
      {
        priority_score: number;
        cadence_status: string | null;
      }
    >();

    for (const row of (priorityRows ?? []) as PriorityRow[]) {
      if (!isAdmin && row.assigned_to_user_id !== me) continue;

      priorityByContactId.set(row.id, {
        priority_score: Number(row.priority_score ?? 0),
        cadence_status: row.cadence_status ?? null,
      });
    }

    let query = supabaseAdmin
      .from("tasks")
      .select(`
        id,
        due_at,
        title,
        notes,
        task_type,
        status,
        kind,
        cadence_key,
        cadence_step,
        contact_id,
        assigned_to_user_id,
        owner_user_id,
        contacts (
          id,
          vertical,
          first_name,
          last_name,
          primary_email,
          job_title_raw,
          sport,
          assigned_to_user_id,
          owner_user_id,
          schools:schools!contacts_school_id_fkey ( name ),
          accounts:accounts!contacts_account_id_fkey ( name )
        )
      `)
      .is("completed_at", null);

    if (taskId) {
      query = query.eq("id", taskId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = ((data ?? []) as RawTaskRow[])
      .filter((row) => {
        const contact = row.contacts?.[0] ?? null;
        if (!contact) return false;
        if (excludeTaskId && row.id === excludeTaskId) return false;
        if (isAdmin) return true;
        return row.assigned_to_user_id === me;
      })
      .map((row) => {
        const priority = priorityByContactId.get(row.contact_id);
        const contact = row.contacts?.[0] ?? null;

        return {
          ...row,
          contacts: contact
            ? {
                ...contact,
                vertical: normalizeVertical(contact.vertical),
                sport: contact.sport ?? "",
              }
            : null,
          __queue_rank: queueRank({
            priorityScore: priority?.priority_score ?? 0,
            dueAt: row.due_at,
            kind: row.kind,
            cadenceStep: row.cadence_step ?? null,
            cadenceStatus: priority?.cadence_status ?? null,
            title: row.title,
            notes: row.notes,
          }),
        };
      })
      .sort((a, b) => {
        const rankDiff = Number(b.__queue_rank || 0) - Number(a.__queue_rank || 0);
        if (rankDiff !== 0) return rankDiff;

        const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      });

    const top = rows[0] ?? null;

    if (!top) {
      return NextResponse.json({ data: null });
    }

    const { __queue_rank, ...clean } = top;

    return NextResponse.json({
      data: clean,
      queue_rank: __queue_rank,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}