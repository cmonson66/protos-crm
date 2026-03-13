"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export type RadarVertical = "coaching" | "corporate";

export type RadarContact = {
  id: string;
  vertical: RadarVertical;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  sport: string;
  status: string | null;
  cadence_status: string | null;
  cadence_step: number;
  school_name: string | null;
  account_name: string | null;
  org_name: string | null;
  assigned_to_user_id: string | null;
  last_activity_at: string | null;
  updated_at: string | null;
  school_tier: number | null;
  priority_score: number;
  momentum_label: "Rising" | "Warm" | "Cooling" | "Cold";
  momentum_score: number;
  priority_reason: string;
};

type Props = {
  title?: string;
  subtitle?: string;
  radar: RadarContact[];
  radarLoading?: boolean;
  promotingId?: string | null;
  activeContactId?: string | null;
  showRefresh?: boolean;
  showOpenButton?: boolean;
  maxHeightClassName?: string;
  onRefresh?: () => void;
  onPromote?: (contactId: string) => void;
};

function fmtName(fn?: string | null, ln?: string | null) {
  const n = `${fn ?? ""} ${ln ?? ""}`.trim();
  return n || "(No name)";
}

function momentumStyles(label?: RadarContact["momentum_label"]) {
  switch (label) {
    case "Rising":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Warm":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Cooling":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "Cold":
      return "bg-slate-50 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function verticalStyles(vertical?: RadarVertical) {
  return vertical === "corporate"
    ? "bg-violet-50 text-violet-700 border-violet-200"
    : "bg-sky-50 text-sky-700 border-sky-200";
}

function daysSince(ts: string | null) {
  if (!ts) return "Never touched";
  const d = new Date(ts).getTime();
  const diff = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "Touched today";
  if (diff === 1) return "1 day since touch";
  return `${diff} days since touch`;
}

export default function PriorityRadarBoard({
  title = "Priority Radar Board",
  subtitle = "Top ranked contacts by dynamic priority score.",
  radar,
  radarLoading = false,
  promotingId = null,
  activeContactId = null,
  showRefresh = true,
  showOpenButton = true,
  maxHeightClassName = "max-h-[900px]",
  onRefresh,
  onPromote,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
        </div>

        {showRefresh ? (
          <Button variant="outline" className="rounded-xl" onClick={onRefresh}>
            Refresh Radar
          </Button>
        ) : null}
      </div>

      {radarLoading ? (
        <div className="text-sm text-muted-foreground">Loading radar…</div>
      ) : radar.length === 0 ? (
        <div className="text-sm text-muted-foreground">No ranked contact available.</div>
      ) : (
        <div className={`${maxHeightClassName} space-y-3 overflow-auto pr-1`}>
          {radar.map((item, idx) => {
            const name = fmtName(item.first_name, item.last_name);
            const titleText = item.org_name ? `${item.org_name} — ${name}` : name;
            const isCurrent = item.id === activeContactId;

            return (
              <div
                key={item.id}
                className={[
                  "rounded-xl border p-3 transition-colors",
                  isCurrent ? "border-emerald-300 bg-emerald-50/60" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        #{idx + 1}
                      </span>

                      <span
                        className={[
                          "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                          verticalStyles(item.vertical),
                        ].join(" ")}
                      >
                        {item.vertical === "corporate" ? "Corporate" : "Coaching"}
                      </span>

                      {isCurrent ? (
                        <span className="inline-flex rounded-full border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                          Live Queue Contact
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 truncate text-sm font-semibold">{titleText}</div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.status || "—"} • {item.cadence_status || "—"}
                      {item.cadence_step > 0 ? ` • Step ${item.cadence_step}` : ""}
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.vertical === "corporate"
                        ? `Focus: ${item.sport || "—"}`
                        : `Sport: ${item.sport || "—"}`}
                      {" • "}
                      {daysSince(item.last_activity_at)}
                    </div>

                    <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {item.priority_reason || "Priority-ranked contact"}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="rounded-lg border px-3 py-1 text-sm font-semibold">
                      {item.priority_score}
                    </div>

                    <div
                      className={[
                        "mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                        momentumStyles(item.momentum_label),
                      ].join(" ")}
                    >
                      {item.momentum_label}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    className="rounded-xl"
                    size="sm"
                    disabled={promotingId === item.id || isCurrent}
                    onClick={() => onPromote?.(item.id)}
                  >
                    {isCurrent
                      ? "Working Now"
                      : promotingId === item.id
                        ? "Promoting..."
                        : "Work Now"}
                  </Button>

                  {showOpenButton ? (
                    <Button variant="outline" size="sm" className="rounded-xl" asChild>
                      <Link href={`/contacts/${item.id}`}>Open</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}