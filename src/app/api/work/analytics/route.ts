import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getManagerScopeUserIds } from "@/lib/apiAuth";

export const runtime = "nodejs";

type SourceKey = "radar_promotion" | "cadence" | "manual_follow_up" | "due_task";

type CompletedTaskRow = {
  id: string;
  kind: string | null;
  notes: string | null;
  title: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
  completed_at: string | null;
  assigned_to_user_id: string | null;
};

type ActivityRow = {
  id: string;
  duration_seconds: number | null;
  outcome: string | null;
  occurred_at: string;
  user_id: string | null;
  subject: string | null;
};

function classifyTask(task: {
  kind: string | null;
  notes: string | null;
  title: string | null;
  cadence_key: string | null;
  cadence_step: number | null;
}): SourceKey {
  const notes = String(task.notes || "").toLowerCase();
  const title = String(task.title || "").toLowerCase();

  if (
    notes.includes("queue_source=radar_promotion") ||
    notes.includes("promoted from priority radar") ||
    title.startsWith("work now:")
  ) {
    return "radar_promotion";
  }

  if (task.kind === "cadence" || task.cadence_key || Number(task.cadence_step || 0) > 0) {
    return "cadence";
  }

  if (task.kind === "manual") {
    return "manual_follow_up";
  }

  return "due_task";
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function sum(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(req: Request) {
  try {
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

    const { data: meProfile, error: meErr } = await supabase
      .from("user_profiles")
      .select("role, is_admin, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (meErr) {
      return NextResponse.json({ error: meErr.message }, { status: 400 });
    }

    if (!meProfile?.is_active) {
      return NextResponse.json({ error: "User inactive" }, { status: 403 });
    }

    const role =
      !!meProfile?.is_admin || meProfile?.role === "admin"
        ? "admin"
        : meProfile?.role === "manager"
          ? "manager"
          : "rep";

    const scopeUserIds = await getManagerScopeUserIds(userId, role);

    const now = new Date();
    const since30 = new Date(now);
    since30.setDate(since30.getDate() - 30);

    const since7 = new Date(now);
    since7.setDate(since7.getDate() - 7);

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const startIso30 = since30.toISOString();

    let tasksQuery = supabase
      .from("tasks")
      .select("id, kind, notes, title, cadence_key, cadence_step, completed_at, assigned_to_user_id")
      .not("completed_at", "is", null)
      .gte("completed_at", startIso30);

    let activitiesQuery = supabase
      .from("activities")
      .select("id, duration_seconds, outcome, occurred_at, user_id, subject")
      .gte("occurred_at", startIso30);

    if (role === "rep") {
      tasksQuery = tasksQuery.eq("assigned_to_user_id", userId);
      activitiesQuery = activitiesQuery.eq("user_id", userId);
    } else if (role === "manager") {
      tasksQuery = tasksQuery.in("assigned_to_user_id", scopeUserIds);
      activitiesQuery = activitiesQuery.in("user_id", scopeUserIds);
    }

    const { data: completedTasks, error: completedErr } = await tasksQuery;
    if (completedErr) {
      return NextResponse.json({ error: completedErr.message }, { status: 400 });
    }

    const { data: activities, error: activitiesErr } = await activitiesQuery;
    if (activitiesErr) {
      return NextResponse.json({ error: activitiesErr.message }, { status: 400 });
    }

    const taskRows = (completedTasks ?? []) as CompletedTaskRow[];
    const activityRows = (activities ?? []) as ActivityRow[];

    const counts: Record<SourceKey, number> = {
      radar_promotion: 0,
      cadence: 0,
      manual_follow_up: 0,
      due_task: 0,
    };

    for (const task of taskRows) {
      const source = classifyTask(task);
      counts[source] += 1;
    }

    const totalCompleted = Object.values(counts).reduce((a, b) => a + b, 0);

    const completedToday = taskRows.filter(
      (t) => t.completed_at && new Date(t.completed_at).getTime() >= today.getTime()
    ).length;

    const completedLast7Days = taskRows.filter(
      (t) => t.completed_at && new Date(t.completed_at).getTime() >= since7.getTime()
    ).length;

    const completedLast30Days = taskRows.length;

    const touchActivities = activityRows.filter(
      (a) => typeof a.duration_seconds === "number" && Number(a.duration_seconds) > 0
    );

    const touchDurations = touchActivities
      .map((a) => Number(a.duration_seconds || 0))
      .filter((n) => n > 0);

    const totalTouchSeconds = sum(touchDurations);
    const avgTouchSeconds = avg(touchDurations);

    const snoozeCount = activityRows.filter(
      (a) => String(a.outcome || "").toLowerCase() === "snooze"
    ).length;

    const skipCount = activityRows.filter(
      (a) => String(a.outcome || "").toLowerCase() === "skip"
    ).length;

    const completeTouchCount = activityRows.filter(
      (a) => String(a.outcome || "").toLowerCase() === "complete"
    ).length;

    const radarCompleted = counts.radar_promotion;
    const cadenceCompleted = counts.cadence;

    const radarPromotionCompletionRate =
      totalCompleted > 0 ? Math.round((radarCompleted / totalCompleted) * 100) : 0;

    const cadenceCompletionRate =
      totalCompleted > 0 ? Math.round((cadenceCompleted / totalCompleted) * 100) : 0;

    const snoozeRate =
      totalCompleted > 0 ? Math.round((snoozeCount / totalCompleted) * 100) : 0;

    const skipRate =
      totalCompleted > 0 ? Math.round((skipCount / totalCompleted) * 100) : 0;

    const tasksPerHour =
      totalTouchSeconds > 0 ? round2(totalCompleted / (totalTouchSeconds / 3600)) : 0;

    const sources = [
      {
        key: "radar_promotion" as const,
        label: "Radar Promotions",
        count: counts.radar_promotion,
        percentage:
          totalCompleted > 0 ? Math.round((counts.radar_promotion / totalCompleted) * 100) : 0,
      },
      {
        key: "cadence" as const,
        label: "Cadence",
        count: counts.cadence,
        percentage: totalCompleted > 0 ? Math.round((counts.cadence / totalCompleted) * 100) : 0,
      },
      {
        key: "manual_follow_up" as const,
        label: "Manual Follow-Up",
        count: counts.manual_follow_up,
        percentage:
          totalCompleted > 0 ? Math.round((counts.manual_follow_up / totalCompleted) * 100) : 0,
      },
      {
        key: "due_task" as const,
        label: "Due Tasks",
        count: counts.due_task,
        percentage: totalCompleted > 0 ? Math.round((counts.due_task / totalCompleted) * 100) : 0,
      },
    ];

    let leaderboard: {
      user_id: string;
      full_name: string | null;
      email: string | null;
      completed_count: number;
      total_touch_seconds: number;
      avg_touch_seconds: number;
      tasks_per_hour: number;
      snooze_count: number;
      skip_count: number;
    }[] = [];

    if (role === "admin" || role === "manager") {
      const repMap = new Map<
        string,
        {
          completed_count: number;
          touch_durations: number[];
          snooze_count: number;
          skip_count: number;
        }
      >();

      for (const task of taskRows) {
        const repId = String(task.assigned_to_user_id || "").trim();
        if (!repId) continue;

        if (!repMap.has(repId)) {
          repMap.set(repId, {
            completed_count: 0,
            touch_durations: [],
            snooze_count: 0,
            skip_count: 0,
          });
        }

        repMap.get(repId)!.completed_count += 1;
      }

      for (const activity of activityRows) {
        const repId = String(activity.user_id || "").trim();
        if (!repId) continue;

        if (!repMap.has(repId)) {
          repMap.set(repId, {
            completed_count: 0,
            touch_durations: [],
            snooze_count: 0,
            skip_count: 0,
          });
        }

        const bucket = repMap.get(repId)!;
        const duration = Number(activity.duration_seconds || 0);

        if (duration > 0) {
          bucket.touch_durations.push(duration);
        }

        const outcome = String(activity.outcome || "").toLowerCase();
        if (outcome === "snooze") bucket.snooze_count += 1;
        if (outcome === "skip") bucket.skip_count += 1;
      }

      const repIds = [...repMap.keys()];

      let profileLookup = new Map<string, { full_name: string | null; email: string | null }>();

      if (repIds.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from("user_profiles")
          .select("user_id, full_name, email")
          .in("user_id", repIds);

        if (profilesErr) {
          return NextResponse.json({ error: profilesErr.message }, { status: 400 });
        }

        profileLookup = new Map(
          (profiles ?? []).map((p: any) => [
            p.user_id,
            {
              full_name: p.full_name ?? null,
              email: p.email ?? null,
            },
          ])
        );
      }

      leaderboard = repIds
        .map((repId) => {
          const bucket = repMap.get(repId)!;
          const totalRepTouchSeconds = sum(bucket.touch_durations);
          const avgRepTouchSeconds = avg(bucket.touch_durations);
          const repTasksPerHour =
            totalRepTouchSeconds > 0
              ? round2(bucket.completed_count / (totalRepTouchSeconds / 3600))
              : 0;

          const profile = profileLookup.get(repId);

          return {
            user_id: repId,
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? null,
            completed_count: bucket.completed_count,
            total_touch_seconds: totalRepTouchSeconds,
            avg_touch_seconds: avgRepTouchSeconds,
            tasks_per_hour: repTasksPerHour,
            snooze_count: bucket.snooze_count,
            skip_count: bucket.skip_count,
          };
        })
        .sort((a, b) => {
          if (b.completed_count !== a.completed_count) {
            return b.completed_count - a.completed_count;
          }
          if (b.tasks_per_hour !== a.tasks_per_hour) {
            return b.tasks_per_hour - a.tasks_per_hour;
          }
          return b.total_touch_seconds - a.total_touch_seconds;
        });
    }

    return NextResponse.json({
      window_days: 30,
      total_completed: totalCompleted,
      completed_today: completedToday,
      completed_last_7_days: completedLast7Days,
      completed_last_30_days: completedLast30Days,
      avg_touch_seconds: avgTouchSeconds,
      total_touch_seconds: totalTouchSeconds,
      complete_touch_count: completeTouchCount,
      snooze_count: snoozeCount,
      skip_count: skipCount,
      promoted_contacts_completed: radarCompleted,
      radar_promotion_completion_rate: radarPromotionCompletionRate,
      cadence_completion_rate: cadenceCompletionRate,
      snooze_rate: snoozeRate,
      skip_rate: skipRate,
      tasks_per_hour: tasksPerHour,
      manager_mode: role === "admin" || role === "manager",
      leaderboard,
      sources,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}