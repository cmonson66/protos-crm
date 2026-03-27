export type ContactVertical = "athletics" | "corporate";

export type PriorityEngineInput = {
  vertical?: ContactVertical | string | null;
  status: string | null;
  cadence_status: string | null;
  cadence_step: number | null;
  last_activity_at: string | null;
  updated_at: string | null;
  cadence_next_due_at?: string | null;

  school_tier?: number | null;
  account_tier?: number | null;
  role_seniority?: string | null;
  market_segment?: string | null;
  buying_intent?: string | null;
  company_size?: number | null;
  existing_score?: number | null;

  open_task_count?: number | null;
  due_task_count?: number | null;
  overdue_task_count?: number | null;
  open_cadence_task_count?: number | null;
  radar_promotion_open_count?: number | null;

  touches_7d?: number | null;
  touches_30d?: number | null;
  completed_touches_30d?: number | null;
  snoozes_30d?: number | null;
};

export type PriorityEngineResult = {
  priority_score: number;
  momentum_score: number;
  momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
  priority_reason: string;
  breakdown: { label: string; points: number }[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeVertical(value: unknown): ContactVertical {
  return String(value || "").toLowerCase() === "corporate" ? "corporate" : "athletics";
}

function normalizeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function daysSince(ts: string | null | undefined) {
  if (!ts) return 9999;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function scoreContact(input: PriorityEngineInput): PriorityEngineResult {
  const breakdown: { label: string; points: number }[] = [];

  const vertical = normalizeVertical(input.vertical);
  const status = String(input.status || "");
  const cadenceStatus = normalizeLower(input.cadence_status);
  const cadenceStep = Number(input.cadence_step || 0);

  const schoolTier = Number(input.school_tier || 0);
  const roleSeniority = normalizeLower(input.role_seniority);

  const openTaskCount = Number(input.open_task_count || 0);
  const dueTaskCount = Number(input.due_task_count || 0);
  const overdueTaskCount = Number(input.overdue_task_count || 0);
  const openCadenceTaskCount = Number(input.open_cadence_task_count || 0);
  const radarPromotionOpenCount = Number(input.radar_promotion_open_count || 0);

  const touches7d = Number(input.touches_7d || 0);
  const completedTouches30d = Number(input.completed_touches_30d || 0);
  const snoozes30d = Number(input.snoozes_30d || 0);
  const existingScore = Number(input.existing_score || 0);

  const staleDays = daysSince(input.last_activity_at);
  const updatedDays = daysSince(input.updated_at);

  let score = 0;
  let momentum = 50;

  breakdown.push({
    label: vertical === "corporate" ? "Corporate contact" : "Athletics contact",
    points: 0,
  });

  if (existingScore > 0) {
    const carryForward = clamp(Math.round(existingScore * 0.15), 0, 15);
    score += carryForward;
    breakdown.push({ label: "Existing score carry-forward", points: carryForward });
  }

  if (status === "New") {
    score += 18;
    breakdown.push({ label: "New contact", points: 18 });
  } else if (status === "Secured/Active") {
    score += 8;
    breakdown.push({ label: "Secured/Active", points: 8 });
  } else if (status === "Closed/Do Not Contact") {
    score -= 50;
    breakdown.push({ label: "Do not contact", points: -50 });
  }

  if (cadenceStatus === "active") {
    score += 14;
    momentum += 10;
    breakdown.push({ label: "Active cadence", points: 14 });
  } else if (cadenceStatus === "inactive") {
    score += 2;
    breakdown.push({ label: "Inactive cadence", points: 2 });
  } else if (cadenceStatus === "completed") {
    score -= 5;
    momentum -= 6;
    breakdown.push({ label: "Completed cadence", points: -5 });
  } else if (cadenceStatus === "stopped") {
    score -= 10;
    momentum -= 10;
    breakdown.push({ label: "Stopped cadence", points: -10 });
  } else if (cadenceStatus === "paused") {
    score -= 6;
    momentum -= 6;
    breakdown.push({ label: "Paused cadence", points: -6 });
  }

  if (cadenceStep >= 4) {
    score += 8;
    breakdown.push({ label: `Cadence step ${cadenceStep}`, points: 8 });
  } else if (cadenceStep === 3) {
    score += 6;
    breakdown.push({ label: "Cadence step 3", points: 6 });
  } else if (cadenceStep === 2) {
    score += 4;
    breakdown.push({ label: "Cadence step 2", points: 4 });
  } else if (cadenceStep === 1) {
    score += 2;
    breakdown.push({ label: "Cadence step 1", points: 2 });
  }

  if (vertical === "athletics") {
    if (schoolTier === 1) {
      score += 12;
      breakdown.push({ label: "Tier 1 program", points: 12 });
    } else if (schoolTier === 2) {
      score += 8;
      breakdown.push({ label: "Tier 2 program", points: 8 });
    } else if (schoolTier === 3) {
      score += 5;
      breakdown.push({ label: "Tier 3 program", points: 5 });
    }
  } else {
    if (
      roleSeniority.includes("chief") ||
      roleSeniority.includes("ceo") ||
      roleSeniority.includes("cfo") ||
      roleSeniority.includes("president") ||
      roleSeniority.includes("founder") ||
      roleSeniority.includes("owner")
    ) {
      score += 12;
      breakdown.push({ label: "Executive decision-maker", points: 12 });
    } else if (
      roleSeniority.includes("vp") ||
      roleSeniority.includes("vice president") ||
      roleSeniority.includes("director") ||
      roleSeniority.includes("head")
    ) {
      score += 8;
      breakdown.push({ label: "Senior buyer/influencer", points: 8 });
    } else if (roleSeniority.includes("manager") || roleSeniority.includes("lead")) {
      score += 4;
      breakdown.push({ label: "Mid-level operator", points: 4 });
    }
  }

  if (staleDays >= 21) {
    score += 18;
    momentum -= 20;
    breakdown.push({ label: "21+ days since touch", points: 18 });
  } else if (staleDays >= 14) {
    score += 14;
    momentum -= 12;
    breakdown.push({ label: "14+ days since touch", points: 14 });
  } else if (staleDays >= 7) {
    score += 9;
    breakdown.push({ label: "7+ days since touch", points: 9 });
  } else if (staleDays >= 3) {
    score += 5;
    breakdown.push({ label: "3+ days since touch", points: 5 });
  } else if (staleDays <= 1) {
    score += 2;
    momentum += 14;
    breakdown.push({ label: "Recently touched", points: 2 });
  }

  const cadenceDueNow =
    !!input.cadence_next_due_at &&
    Number.isFinite(new Date(input.cadence_next_due_at).getTime()) &&
    new Date(input.cadence_next_due_at!).getTime() <= Date.now();

  if (cadenceDueNow) {
    score += 12;
    momentum += 8;
    breakdown.push({ label: "Cadence due now", points: 12 });
  }

  if (overdueTaskCount > 0) {
    score += 14;
    breakdown.push({ label: "Overdue task", points: 14 });
  } else if (dueTaskCount > 0) {
    score += 8;
    breakdown.push({ label: "Due task", points: 8 });
  }

  if (radarPromotionOpenCount > 0) {
    score += 10;
    breakdown.push({ label: "Promoted from radar", points: 10 });
  }

  if (openCadenceTaskCount > 0) {
    score += 5;
    breakdown.push({ label: "Open cadence work", points: 5 });
  }

  if (openTaskCount > 0) {
    breakdown.push({ label: "Open tasks present", points: 0 });
  }

  if (touches7d >= 5) {
    score += 6;
    momentum += 10;
    breakdown.push({ label: "High recent activity", points: 6 });
  } else if (touches7d >= 3) {
    score += 4;
    momentum += 7;
    breakdown.push({ label: "Recent activity cluster", points: 4 });
  } else if (touches7d >= 1) {
    score += 2;
    momentum += 4;
    breakdown.push({ label: "Touched this week", points: 2 });
  }

  if (completedTouches30d >= 3) {
    score += 4;
    breakdown.push({ label: "Strong execution history", points: 4 });
  } else if (completedTouches30d >= 1) {
    score += 2;
    breakdown.push({ label: "Execution history", points: 2 });
  }

  if (snoozes30d >= 4) {
    score -= 8;
    momentum -= 10;
    breakdown.push({ label: "Repeated snoozes", points: -8 });
  } else if (snoozes30d >= 2) {
    score -= 4;
    momentum -= 6;
    breakdown.push({ label: "Multiple snoozes", points: -4 });
  } else if (snoozes30d >= 1) {
    score -= 2;
    momentum -= 3;
    breakdown.push({ label: "Recently snoozed", points: -2 });
  }

  if (updatedDays <= 2) {
    momentum += 5;
  } else if (updatedDays >= 30) {
    momentum -= 8;
  }

  score = clamp(Math.round(score), 0, 100);
  momentum = clamp(Math.round(momentum), 0, 100);

  let momentumLabel: PriorityEngineResult["momentum_label"] = "Cold";
  if (momentum >= 75) momentumLabel = "Rising";
  else if (momentum >= 55) momentumLabel = "Warm";
  else if (momentum >= 35) momentumLabel = "Cooling";
  else momentumLabel = "Cold";

  const topReasons = [...breakdown]
    .filter((x) => x.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((x) => x.label);

  return {
    priority_score: score,
    momentum_score: momentum,
    momentum_label: momentumLabel,
    priority_reason: topReasons.join(", "),
    breakdown,
  };
}