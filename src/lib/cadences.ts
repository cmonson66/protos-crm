export type CadenceKey = "nfl_d1_perf_initial";

export type CadenceStep = {
  step: 1 | 2 | 3 | 4 | 5;
  label: string;
  // "Day 1", "Day 4", etc - for display only
  timingLabel: string;
  // Days after the previous step (Step 1 is 0)
  offsetDaysFromPrev: number;
  subject: string;
  body: string; // use {{firstName}} placeholder
};

export type Cadence = {
  key: CadenceKey;
  label: string;
  steps: CadenceStep[];
};

export type ContactForCadence = {
  first_name: string | null;
};

function safe(value: string | null | undefined, fallback: string) {
  const v = (value ?? "").trim();
  return v ? v : fallback;
}

export function renderCadenceStep(step: CadenceStep, contact: ContactForCadence) {
  const firstName = safe(contact.first_name, "Coach");

  const subject = step.subject.replaceAll("{{firstName}}", firstName);
  const body = step.body.replaceAll("{{firstName}}", firstName);

  return { subject, body };
}

export function computeNextDueAtISO(
  from: Date,
  offsetDays: number
): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  // Local morning @ 9am
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T09:00:00`).toISOString();
}

/**
 * Update these 5 emails to match the final client-approved copy.
 * I used what is visible in your screenshot for 1,2,3,5.
 * Email 4 wasn't visible — placeholder is included.
 */
export const CADENCES: Cadence[] = [
  {
    key: "nfl_d1_perf_initial",
    label: "Football DSP/Player Development — Initial Cadence",
    steps: [
      {
        step: 1,
        label: "Email 1 — Introduction / Relevance",
        timingLabel: "Day 1",
        offsetDaysFromPrev: 0,
        subject: "When pressure hits, what actually holds up?",
        body:
          `Hi {{firstName}},\n\n` +
          `At Protos EQ, we work with football programs to make behavior measurable and leadership coachable—so performance doesn’t disappear when pressure shows up.\n\n` +
          `Using validated behavioral and EQ assessments, we help performance and player development staffs understand how athletes and coaches think, communicate, and lead in high-stakes moments.\n\n` +
          `If aligning behavior, leadership, and performance across your program is a priority, I’d welcome a quick conversation.\n\n` +
          `— Protos EQ`,
      },
      {
        step: 2,
        label: "Email 2 — Problem Framing",
        timingLabel: "Day 4",
        offsetDaysFromPrev: 3,
        subject: "Pressure doesn’t test systems—it tests behavior",
        body:
          `Hi {{firstName}},\n\n` +
          `Most programs train skills, systems, and bodies exceptionally well.\n` +
          `Where performance often breaks down is behavior under pressure—communication, decision-making, and leadership when margins are thin.\n\n` +
          `That’s the gap we address at Protos EQ.\n` +
          `We give staffs objective insight into how players and coaches actually operate under pressure, not how they think they do.\n\n` +
          `Worth a short exchange if this is showing up in your world.\n\n` +
          `— Protos EQ`,
      },
      {
        step: 3,
        label: "Email 3 — Value & Differentiation",
        timingLabel: "Day 7",
        offsetDaysFromPrev: 3,
        subject: "Turning behavior into usable data",
        body:
          `Hi {{firstName}},\n\n` +
          `What separates Protos EQ is simple: we don’t guess about culture or leadership.\n\n` +
          `Our behavioral and EQ data helps performance and player development staffs:\n` +
          `• Align coaches and players faster\n` +
          `• Reduce friction under pressure\n` +
          `• Develop leaders intentionally, not accidentally\n\n` +
          `It’s practical, measurable, and built for high-performance football environments.\n\n` +
          `If you’re open, I’d be glad to share how programs are using this alongside their current performance model.\n\n` +
          `— Protos EQ`,
      },
      {
        step: 4,
        label: "Email 4 — Social Proof (No Name Dropping)",
        timingLabel: "Day 11",
        offsetDaysFromPrev: 4,
        subject: "Built for real football environments",
        body:
          `Hi {{firstName}},\n\n` +
          `We work across professional and collegiate football with staffs who care deeply about performance, alignment, and leadership consistency.\n\n` +
          `The feedback is consistent:\n` +
          `greater clarity, better communication under stress, and leaders who show up the same way when the lights are on.\n\n` +
          `If that’s something you’re working toward this season or offseason, happy to connect.\n\n` +
          `— Protos EQ`,
      },
      {
        step: 5,
        label: "Email 5 — Breakup / Low-Pressure CTA",
        timingLabel: "Day 16–18",
        offsetDaysFromPrev: 6,
        subject: "Should I close the loop?",
        body:
          `Hi {{firstName}},\n\n` +
          `I haven’t heard back, so I’ll pause after this.\n\n` +
          `If making behavior and leadership more consistent under pressure is relevant for you or your staff, I’m happy to connect. If not, no worries at all.\n\n` +
          `Either way, appreciate the work you do in a demanding role.\n\n` +
          `— Protos EQ`,
      },
    ],
  },
];

export function getCadence(key: CadenceKey): Cadence {
  const c = CADENCES.find((x) => x.key === key);
  if (!c) throw new Error(`Cadence not found: ${key}`);
  return c;
}

export function getCadenceStep(key: CadenceKey, stepNumber: number): CadenceStep | null {
  const c = getCadence(key);
  return c.steps.find((s) => s.step === stepNumber) ?? null;
}