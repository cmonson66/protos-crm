export type AccountHeatLabel = "Hot" | "Warm" | "Cooling" | "Cold";

export type AccountHeatInput = {
  total_contacts: number;
  active_cadences: number;
  touched_last_7_days: number;
  stale_contacts: number;
  secured_active_contacts: number;
  highest_priority_score: number;
  most_recent_activity_at: string | null;
  buying_committee_coverage: {
    has_economic_buyer: boolean;
    has_technical_buyer: boolean;
    has_champion: boolean;
    has_operator: boolean;
  };
};

export type AccountHeatBreakdownItem = {
  label: string;
  points: number;
};

export type AccountHeatResult = {
  account_heat_score: number;
  account_heat_label: AccountHeatLabel;
  account_heat_reason: string;
  breakdown: AccountHeatBreakdownItem[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function daysSince(ts: string | null | undefined) {
  if (!ts) return 9999;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return 9999;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function scoreAccountHeat(input: AccountHeatInput): AccountHeatResult {
  const breakdown: AccountHeatBreakdownItem[] = [];
  let score = 0;

  if (input.total_contacts >= 5) {
    score += 10;
    breakdown.push({ label: "Deep account coverage", points: 10 });
  } else if (input.total_contacts >= 3) {
    score += 7;
    breakdown.push({ label: "Multi-contact account", points: 7 });
  } else if (input.total_contacts >= 2) {
    score += 4;
    breakdown.push({ label: "More than one contact", points: 4 });
  } else if (input.total_contacts === 1) {
    score -= 4;
    breakdown.push({ label: "Single-threaded account", points: -4 });
  }

  if (input.active_cadences >= 3) {
    score += 14;
    breakdown.push({ label: "Multiple active cadences", points: 14 });
  } else if (input.active_cadences >= 2) {
    score += 10;
    breakdown.push({ label: "Two active cadences", points: 10 });
  } else if (input.active_cadences === 1) {
    score += 6;
    breakdown.push({ label: "One active cadence", points: 6 });
  }

  if (input.touched_last_7_days >= 3) {
    score += 16;
    breakdown.push({ label: "Strong recent engagement", points: 16 });
  } else if (input.touched_last_7_days >= 2) {
    score += 11;
    breakdown.push({ label: "Recent multi-contact activity", points: 11 });
  } else if (input.touched_last_7_days === 1) {
    score += 6;
    breakdown.push({ label: "Recent activity", points: 6 });
  } else {
    score -= 8;
    breakdown.push({ label: "No recent account activity", points: -8 });
  }

  if (input.secured_active_contacts >= 2) {
    score += 14;
    breakdown.push({ label: "Multiple secured/active contacts", points: 14 });
  } else if (input.secured_active_contacts === 1) {
    score += 8;
    breakdown.push({ label: "At least one secured/active contact", points: 8 });
  }

  if (input.highest_priority_score >= 90) {
    score += 14;
    breakdown.push({ label: "Very high-priority stakeholder", points: 14 });
  } else if (input.highest_priority_score >= 75) {
    score += 10;
    breakdown.push({ label: "High-priority stakeholder", points: 10 });
  } else if (input.highest_priority_score >= 60) {
    score += 6;
    breakdown.push({ label: "Mid-high priority stakeholder", points: 6 });
  }

  if (input.buying_committee_coverage.has_economic_buyer) {
    score += 12;
    breakdown.push({ label: "Economic buyer identified", points: 12 });
  } else {
    score -= 10;
    breakdown.push({ label: "Missing economic buyer", points: -10 });
  }

  if (input.buying_committee_coverage.has_technical_buyer) {
    score += 8;
    breakdown.push({ label: "Technical buyer identified", points: 8 });
  } else {
    score -= 4;
    breakdown.push({ label: "Missing technical buyer", points: -4 });
  }

  if (input.buying_committee_coverage.has_champion) {
    score += 8;
    breakdown.push({ label: "Champion identified", points: 8 });
  } else {
    score -= 6;
    breakdown.push({ label: "Missing champion", points: -6 });
  }

  if (input.buying_committee_coverage.has_operator) {
    score += 4;
    breakdown.push({ label: "Operator identified", points: 4 });
  }

  if (input.stale_contacts >= 3) {
    score -= 16;
    breakdown.push({ label: "Several stale contacts", points: -16 });
  } else if (input.stale_contacts >= 2) {
    score -= 10;
    breakdown.push({ label: "Multiple stale contacts", points: -10 });
  } else if (input.stale_contacts === 1) {
    score -= 5;
    breakdown.push({ label: "One stale contact", points: -5 });
  }

  const recentActivityDays = daysSince(input.most_recent_activity_at);
  if (recentActivityDays <= 2) {
    score += 10;
    breakdown.push({ label: "Very recent account activity", points: 10 });
  } else if (recentActivityDays <= 7) {
    score += 5;
    breakdown.push({ label: "Activity within last week", points: 5 });
  } else if (recentActivityDays >= 21) {
    score -= 10;
    breakdown.push({ label: "No recent account motion", points: -10 });
  }

  score = clamp(Math.round(score), 0, 100);

  let label: AccountHeatLabel = "Cold";
  if (score >= 75) label = "Hot";
  else if (score >= 55) label = "Warm";
  else if (score >= 35) label = "Cooling";

  const reason = [...breakdown]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((x) => x.label)
    .join(", ");

  return {
    account_heat_score: score,
    account_heat_label: label,
    account_heat_reason: reason,
    breakdown,
  };
}