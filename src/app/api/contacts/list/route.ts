import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scoreContact } from "@/lib/priorityEngine";

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

    const role = meProfile?.is_admin
      ? "admin"
      : meProfile?.role === "manager"
        ? "manager"
        : "rep";

    let visibleUserIds = [userId];

    if (role === "manager") {
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
    } else if (role === "admin") {
      const { data: scopedUsers, error: scopeErr } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("is_active", true);

      if (scopeErr) {
        return NextResponse.json({ error: scopeErr.message }, { status: 400 });
      }

      visibleUserIds = Array.from(
        new Set([userId, ...(scopedUsers ?? []).map((r) => String(r.user_id))])
      );
    }

    const { data: cpsData, error: cpsErr } = await supabase.rpc("contact_priority_scores_v2");

    if (cpsErr) {
      return NextResponse.json({ error: cpsErr.message }, { status: 400 });
    }

    let rows = (cpsData ?? []) as any[];

    if (role !== "admin") {
      rows = rows.filter((r) => visibleUserIds.includes(String(r.assigned_to_user_id || "")));
    }

    if (sport) {
      rows = rows.filter((r) => (r.sport || "") === sport);
    }

    if (status) {
      rows = rows.filter((r) => (r.status || "") === status);
    }

    if (cadenceStatus) {
      rows = rows.filter((r) => (r.cadence_status || "") === cadenceStatus);
    }

    if (role !== "rep") {
      if (unassigned) {
        rows = rows.filter((r) => !r.assigned_to_user_id);
      } else if (assignedTo) {
        rows = rows.filter((r) => r.assigned_to_user_id === assignedTo);
      }
    }

    if (q) {
      const ql = q.toLowerCase();
      rows = rows.filter((r) => {
        const fn = (r.first_name || "").toLowerCase();
        const ln = (r.last_name || "").toLowerCase();
        const em = (r.primary_email || "").toLowerCase();
        const school = (r.school_name || "").toLowerCase();
        const account = (r.account_name || "").toLowerCase();
        const org = String(r.org_name || r.account_name || r.school_name || "").toLowerCase();
        const title = (r.job_title_raw || "").toLowerCase();
        const vertical = (r.vertical || "").toLowerCase();
        const segment = (r.market_segment || "").toLowerCase();

        return (
          fn.includes(ql) ||
          ln.includes(ql) ||
          em.includes(ql) ||
          school.includes(ql) ||
          account.includes(ql) ||
          org.includes(ql) ||
          title.includes(ql) ||
          vertical.includes(ql) ||
          segment.includes(ql)
        );
      });
    }

    if (stale) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      rows = rows.filter((r) => {
        if (!r.last_activity_at) return true;
        return new Date(r.last_activity_at).getTime() < cutoff;
      });
    }

    const enriched = rows.map((r) => {
      const vertical = normalizeVertical(r.vertical);

      const scored = scoreContact({
        vertical,
        status: r.status ?? null,
        cadence_status: r.cadence_status ?? null,
        cadence_step: Number(r.cadence_step || 0),
        last_activity_at: r.last_activity_at ?? null,
        updated_at: r.updated_at ?? null,
        cadence_next_due_at: r.cadence_next_due_at ?? null,
        school_tier: r.school_tier ?? null,
        account_tier: r.account_tier ?? null,
        role_seniority: r.role_seniority ?? r.job_title_raw ?? null,
        market_segment: r.market_segment ?? null,
        buying_intent: r.buying_intent ?? null,
        company_size: r.company_size ?? null,
        open_task_count: r.open_task_count ?? null,
        due_task_count: r.due_task_count ?? null,
        overdue_task_count: r.overdue_task_count ?? null,
        open_cadence_task_count: r.open_cadence_task_count ?? null,
        radar_promotion_open_count: r.radar_promotion_open_count ?? null,
        touches_7d: r.touches_7d ?? null,
        touches_30d: r.touches_30d ?? null,
        completed_touches_30d: r.completed_touches_30d ?? null,
        snoozes_30d: r.snoozes_30d ?? null,
      });

      return {
        ...r,
        vertical,
        org_name: (r.org_name || r.account_name || r.school_name || null) as string | null,
        computed_priority_score: scored.priority_score,
        momentum_label: scored.momentum_label,
        momentum_score: scored.momentum_score,
        priority_reason: scored.priority_reason,
      };
    });

    const compareNullableDate = (
      a: string | null,
      b: string | null,
      nullsLast = true
    ) => {
      const av = a ? new Date(a).getTime() : null;
      const bv = b ? new Date(b).getTime() : null;

      if (av === null && bv === null) return 0;
      if (av === null) return nullsLast ? 1 : -1;
      if (bv === null) return nullsLast ? -1 : 1;
      return av - bv;
    };

    enriched.sort((a, b) => {
      let result = 0;

      switch (sortBy) {
        case "priority":
          result =
            Number(a.computed_priority_score || 0) -
            Number(b.computed_priority_score || 0);
          if (result === 0) {
            result = Number(a.momentum_score || 0) - Number(b.momentum_score || 0);
          }
          break;

        case "momentum":
          result = Number(a.momentum_score || 0) - Number(b.momentum_score || 0);
          if (result === 0) {
            result =
              Number(a.computed_priority_score || 0) -
              Number(b.computed_priority_score || 0);
          }
          break;

        case "last_touch":
          result = compareNullableDate(
            a.last_activity_at ?? null,
            b.last_activity_at ?? null,
            false
          );
          if (result === 0) {
            result =
              Number(a.computed_priority_score || 0) -
              Number(b.computed_priority_score || 0);
          }
          break;

        case "cadence_step":
          result = Number(a.cadence_step || 0) - Number(b.cadence_step || 0);
          if (result === 0) {
            result =
              Number(a.computed_priority_score || 0) -
              Number(b.computed_priority_score || 0);
          }
          break;

        case "updated_at":
          result = compareNullableDate(a.updated_at ?? null, b.updated_at ?? null, false);
          if (result === 0) {
            result =
              Number(a.computed_priority_score || 0) -
              Number(b.computed_priority_score || 0);
          }
          break;

        case "name": {
          const aName = `${a.last_name || ""} ${a.first_name || ""}`.trim().toLowerCase();
          const bName = `${b.last_name || ""} ${b.first_name || ""}`.trim().toLowerCase();
          result = aName.localeCompare(bName);
          if (result === 0) {
            result =
              Number(a.computed_priority_score || 0) -
              Number(b.computed_priority_score || 0);
          }
          break;
        }

        default:
          result =
            Number(a.computed_priority_score || 0) -
            Number(b.computed_priority_score || 0);
      }

      return sortDir === "asc" ? result : -result;
    });

    const total = enriched.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = enriched.slice(start, start + pageSize);

    const output: ContactRow[] = paged.map((r: any) => ({
      id: r.id,
      vertical: normalizeVertical(r.vertical),
      first_name: r.first_name,
      last_name: r.last_name,
      primary_email: r.primary_email,
      job_title_raw: r.job_title_raw ?? null,
      sport: r.sport ?? "",
      status: r.status,
      cadence_status: r.cadence_status,
      cadence_next_due_at: r.cadence_next_due_at ?? null,
      school_name: r.school_name ?? null,
      account_name: r.account_name ?? null,
      org_name: (r.org_name || r.account_name || r.school_name || null) as string | null,
      assigned_to_user_id: r.assigned_to_user_id ?? null,
      updated_at: r.updated_at ?? null,
      last_activity_at: r.last_activity_at ?? null,
      priority_score: Number(r.computed_priority_score || 0),
      school_tier: r.school_tier ?? null,
      cadence_step: Number(r.cadence_step || 0),
      momentum_label: r.momentum_label,
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