export type ContactVertical = "coaching" | "corporate";

export type PriorityEngineInput = {
  vertical?: ContactVertical | string | null;
  status: string | null;
  cadence_status: string | null;
  cadence_step: number | null;
  last_activity_at: string | null;
  updated_at: string | null;
  cadence_next_due_at?: string | null;

  school_tier?: number | null;
  existing_score?: number | null;

  account_tier?: number | null;
  role_seniority?: string | null;
  market_segment?: string | null;
  buying_intent?: string | null;
  company_size?: number | null;
};

export type PriorityEngineResult = {
  priority_score: number;
  momentum_score: number;
  momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
  priority_reason: string;
  breakdown: { label: string; points: number }[];
};

function daysSince(ts: string | null | undefined) {
  if (!ts) return 9999;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeVertical(value: unknown): ContactVertical {
  return String(value || "").toLowerCase() === "corporate" ? "corporate" : "coaching";
}

function normalizeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function scoreCoachingContext(args: {
  schoolTier: number;
  breakdown: { label: string; points: number }[];
}) {
  const { schoolTier, breakdown } = args;
  let score = 0;

  if (schoolTier === 1) {
    score += 18;
    breakdown.push({ label: "Tier 1 program", points: 18 });
  } else if (schoolTier === 2) {
    score += 12;
    breakdown.push({ label: "Tier 2 program", points: 12 });
  } else if (schoolTier === 3) {
    score += 7;
    breakdown.push({ label: "Tier 3 program", points: 7 });
  }

  return score;
}

function scoreCorporateContext(args: {
  accountTier: number;
  roleSeniority: string;
  marketSegment: string;
  buyingIntent: string;
  companySize: number;
  breakdown: { label: string; points: number }[];
}) {
  const {
    accountTier,
    roleSeniority,
    marketSegment,
    buyingIntent,
    companySize,
    breakdown,
  } = args;

  let score = 0;

  if (accountTier === 1) {
    score += 18;
    breakdown.push({ label: "Tier 1 account", points: 18 });
  } else if (accountTier === 2) {
    score += 12;
    breakdown.push({ label: "Tier 2 account", points: 12 });
  } else if (accountTier === 3) {
    score += 7;
    breakdown.push({ label: "Tier 3 account", points: 7 });
  }

  if (
    roleSeniority.includes("chief") ||
    roleSeniority.includes("cfo") ||
    roleSeniority.includes("ceo") ||
    roleSeniority.includes("president") ||
    roleSeniority.includes("founder") ||
    roleSeniority.includes("owner")
  ) {
    score += 14;
    breakdown.push({ label: "Executive decision-maker", points: 14 });
  } else if (
    roleSeniority.includes("vp") ||
    roleSeniority.includes("vice president") ||
    roleSeniority.includes("head") ||
    roleSeniority.includes("director")
  ) {
    score += 10;
    breakdown.push({ label: "Senior buyer/influencer", points: 10 });
  } else if (
    roleSeniority.includes("manager") ||
    roleSeniority.includes("lead")
  ) {
    score += 6;
    breakdown.push({ label: "Mid-level operator", points: 6 });
  }

  if (
    marketSegment.includes("financial") ||
    marketSegment.includes("insurance") ||
    marketSegment.includes("wealth") ||
    marketSegment.includes("advisory")
  ) {
    score += 8;
    breakdown.push({ label: "High-fit market segment", points: 8 });
  } else if (marketSegment) {
    score += 3;
    breakdown.push({ label: "Defined target segment", points: 3 });
  }

  if (
    buyingIntent.includes("demo") ||
    buyingIntent.includes("proposal") ||
    buyingIntent.includes("active evaluation") ||
    buyingIntent.includes("budget")
  ) {
    score += 12;
    breakdown.push({ label: "Strong buying signal", points: 12 });
  } else if (
    buyingIntent.includes("interested") ||
    buyingIntent.includes("curious") ||
    buyingIntent.includes("replied")
  ) {
    score += 6;
    breakdown.push({ label: "Moderate buying signal", points: 6 });
  }

  if (companySize >= 5000) {
    score += 8;
    breakdown.push({ label: "Large organization", points: 8 });
  } else if (companySize >= 500) {
    score += 5;
    breakdown.push({ label: "Mid-size organization", points: 5 });
  } else if (companySize >= 50) {
    score += 2;
    breakdown.push({ label: "Established organization", points: 2 });
  }

  return score;
}

export function scoreContact(input: PriorityEngineInput): PriorityEngineResult {
  const breakdown: { label: string; points: number }[] = [];

  const vertical = normalizeVertical(input.vertical);
  const status = String(input.status || "");
  const cadenceStatus = String(input.cadence_status || "");
  const cadenceStep = Number(input.cadence_step || 0);

  const schoolTier = Number(input.school_tier || 0);
  const accountTier = Number(input.account_tier || 0);
  const companySize = Number(input.company_size || 0);

  const roleSeniority = normalizeLower(input.role_seniority);
  const marketSegment = normalizeLower(input.market_segment);
  const buyingIntent = normalizeLower(input.buying_intent);

  const staleDays = daysSince(input.last_activity_at);
  const updatedDays = daysSince(input.updated_at);

  let score = 0;
  let momentum = 50;

  if (vertical === "corporate") {
    breakdown.push({ label: "Corporate contact", points: 0 });
  } else {
    breakdown.push({ label: "Coaching contact", points: 0 });
  }

  if (status === "New") {
    score += 22;
    breakdown.push({ label: "New contact", points: 22 });
    momentum += 8;
  } else if (status === "Secured/Active") {
    score += 8;
    breakdown.push({ label: "Secured/Active", points: 8 });
    momentum += 4;
  } else if (status === "Closed/Do Not Contact") {
    score -= 40;
    breakdown.push({ label: "Do not contact", points: -40 });
    momentum -= 35;
  }

  if (cadenceStatus === "active") {
    score += 18;
    breakdown.push({ label: "Active cadence", points: 18 });
    momentum += 10;
  } else if (cadenceStatus === "inactive") {
    score += 4;
    breakdown.push({ label: "Inactive cadence", points: 4 });
  } else if (cadenceStatus === "completed") {
    score -= 4;
    breakdown.push({ label: "Completed cadence", points: -4 });
    momentum -= 8;
  } else if (cadenceStatus === "stopped") {
    score -= 10;
    breakdown.push({ label: "Stopped cadence", points: -10 });
    momentum -= 12;
  } else if (cadenceStatus === "paused") {
    score -= 6;
    breakdown.push({ label: "Paused cadence", points: -6 });
    momentum -= 6;
  }

  if (cadenceStep >= 4) {
    score += 8;
    breakdown.push({ label: `Cadence step ${cadenceStep}`, points: 8 });
    momentum += 5;
  } else if (cadenceStep === 3) {
    score += 6;
    breakdown.push({ label: "Cadence step 3", points: 6 });
    momentum += 4;
  } else if (cadenceStep === 2) {
    score += 5;
    breakdown.push({ label: "Cadence step 2", points: 5 });
    momentum += 3;
  } else if (cadenceStep === 1) {
    score += 3;
    breakdown.push({ label: "Cadence step 1", points: 3 });
    momentum += 2;
  }

  if (vertical === "corporate") {
    score += scoreCorporateContext({
      accountTier,
      roleSeniority,
      marketSegment,
      buyingIntent,
      companySize,
      breakdown,
    });
  } else {
    score += scoreCoachingContext({
      schoolTier,
      breakdown,
    });
  }

  if (staleDays >= 21) {
    score += 20;
    breakdown.push({ label: "21+ days since touch", points: 20 });
    momentum -= 25;
  } else if (staleDays >= 14) {
    score += 16;
    breakdown.push({ label: "14+ days since touch", points: 16 });
    momentum -= 18;
  } else if (staleDays >= 7) {
    score += 11;
    breakdown.push({ label: "7+ days since touch", points: 11 });
    momentum -= 10;
  } else if (staleDays >= 3) {
    score += 6;
    breakdown.push({ label: "3+ days since touch", points: 6 });
    momentum -= 4;
  } else if (staleDays <= 1) {
    score += 3;
    breakdown.push({ label: "Recently touched", points: 3 });
    momentum += 10;
  }

  const nextDueTs = input.cadence_next_due_at ? new Date(input.cadence_next_due_at).getTime() : null;
  if (nextDueTs && Number.isFinite(nextDueTs) && nextDueTs <= Date.now()) {
    score += 15;
    breakdown.push({ label: "Cadence due now", points: 15 });
    momentum += 8;
  }

  if (updatedDays >= 30) {
    momentum -= 10;
  } else if (updatedDays <= 2) {
    momentum += 5;
  }

  const existingScore = Number(input.existing_score || 0);
  if (existingScore > 0) {
    const blended = Math.round(existingScore * 0.35);
    score += blended;
    breakdown.push({ label: "Base engine score", points: blended });
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