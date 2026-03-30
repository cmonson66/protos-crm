import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Vertical = "athletics" | "corporate";

type ContactRow = {
  id: string;
  vertical: Vertical;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  job_title_raw: string | null;
  sport: string;
  status: string;
  cadence_status: string;
  cadence_next_due_at: string | null;
  school_name: string | null;
  account_name: string | null;
  org_name: string | null;
  assigned_to_user_id: string | null;
  updated_at: string | null;
  last_activity_at: string | null;
  priority_score: number;
  school_tier: number | null;
  cadence_step: number;
  momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
  momentum_score: number;
  priority_reason: string;
};

type SortBy =
  | "priority"
  | "last_touch"
  | "cadence_step"
  | "updated_at"
  | "name"
  | "momentum";

type SortDir = "asc" | "desc";

function normalizeVertical(value: unknown): Vertical {
  return value === "corporate" ? "corporate" : "athletics";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const q = (url.searchParams.get("q") || "").trim();
    const sport = (url.searchParams.get("sport") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const cadenceStatus = (url.searchParams.get("cadence_status") || "").trim();
    const assignedTo = (url.searchParams.get("assigned_to_user_id") || "").trim();
    const unassigned = (url.searchParams.get("unassigned") || "").trim() === "1";
    const stale = (url.searchParams.get("stale") || "").trim() === "1";

    const sortByRaw = (url.searchParams.get("sort_by") || "priority").trim() as SortBy;
    const sortDirRaw = (url.searchParams.get("sort_dir") || "desc").trim() as SortDir;

    const allowedSortBy: SortBy[] = [
      "priority",
      "last_touch",
      "cadence_step",
      "updated_at",
      "name",
      "momentum",
    ];
    const allowedSortDir: SortDir[] = ["asc", "desc"];

    const sortBy: SortBy = allowedSortBy.includes(sortByRaw) ? sortByRaw : "priority";
    const sortDir: SortDir = allowedSortDir.includes(sortDirRaw) ? sortDirRaw : "desc";

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSizeRaw = Number(url.searchParams.get("pageSize") || 25);
    const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
    const offset = (page - 1) * pageSize;

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
    const userId = userData.user?.id;

    if (userErr || !userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data: meProfile, error: profErr } = await supabase
      .from("user_profiles")
      .select("is_admin, role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    if (!meProfile?.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const role =
      meProfile?.is_admin
        ? "admin"
        : meProfile?.role === "manager"
          ? "manager"
          : "rep";

    let visibleUserIds: string[] | null = null;

    if (role === "rep") {
      visibleUserIds = [userId];
    } else if (role === "manager") {
      const { data: scopedUsers, error: scopeErr } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("is_active", true)
        .eq("manager_user_id", userId);

      if (scopeErr) {
        return NextResponse.json({ error: scopeErr.message }, { status: 400 });
      }

      visibleUserIds = Array.from(
        new Set([userId, ...(scopedUsers ?? []).map((r) => String(r.user_id))])
      );
    }

    const assignedToUuid = !unassigned && assignedTo ? assignedTo : null;

    const { data: cpsData, error: cpsErr } = await supabase.rpc(
      "contact_priority_scores_v2",
      {
        p_visible_user_ids: visibleUserIds,
        p_q: q || null,
        p_sport: sport || null,
        p_status: status || null,
        p_cadence_status: cadenceStatus || null,
        p_assigned_to_user_id: assignedToUuid,
        p_unassigned: unassigned,
        p_stale: stale,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
        p_limit: pageSize,
        p_offset: offset,
      }
    );

    if (cpsErr) {
      return NextResponse.json({ error: cpsErr.message }, { status: 400 });
    }

    const { data: totalCount, error: totalErr } = await supabase.rpc(
      "contact_priority_scores_v2_count",
      {
        p_visible_user_ids: visibleUserIds,
        p_q: q || null,
        p_sport: sport || null,
        p_status: status || null,
        p_cadence_status: cadenceStatus || null,
        p_assigned_to_user_id: assignedToUuid,
        p_unassigned: unassigned,
        p_stale: stale,
      }
    );

    if (totalErr) {
      return NextResponse.json({ error: totalErr.message }, { status: 400 });
    }

    const total = Number(totalCount ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const output: ContactRow[] = ((cpsData ?? []) as any[]).map((r: any) => ({
      id: r.id,
      vertical: normalizeVertical(r.vertical),
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      primary_email: r.primary_email ?? null,
      job_title_raw: r.role_seniority ?? null,
      sport: r.sport ?? "",
      status: r.status ?? "New",
      cadence_status: r.cadence_status ?? "inactive",
      cadence_next_due_at: r.cadence_next_due_at ?? null,
      school_name: r.school_name ?? null,
      account_name: r.account_name ?? null,
      org_name: (r.org_name || r.account_name || r.school_name || null) as string | null,
      assigned_to_user_id: r.assigned_to_user_id ?? null,
      updated_at: r.updated_at ?? null,
      last_activity_at: r.last_activity_at ?? null,
      priority_score: Number(r.priority_score || 0),
      school_tier: r.school_tier ?? null,
      cadence_step: Number(r.cadence_step || 0),
      momentum_label: (r.momentum_label || "Cold") as ContactRow["momentum_label"],
      momentum_score: Number(r.momentum_score || 0),
      priority_reason: r.priority_reason || "",
    }));

    return NextResponse.json({
      data: output,
      page,
      pageSize,
      total,
      totalPages,
      sort_by: sortBy,
      sort_dir: sortDir,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}