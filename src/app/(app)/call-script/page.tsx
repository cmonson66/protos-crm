"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

function decode(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function CallScriptPage() {
  const searchParams = useSearchParams();

  const title = decode(searchParams.get("title")) || "Call Script";
  const contact = decode(searchParams.get("contact")) || "Contact";
  const company = decode(searchParams.get("company")) || "";
  const script = decode(searchParams.get("body")) || "";

  const scriptLines = useMemo(() => {
    return script.split("\n");
  }, [script]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Live Call Script
            </div>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">{title}</h1>
            <div className="mt-3 text-xl text-slate-700">
              {contact}
              {company ? ` • ${company}` : ""}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(script)}
              className="rounded-xl border border-slate-300 px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50"
            >
              Copy Script
            </button>

            <button
              onClick={() => window.close()}
              className="rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800"
            >
              Done / Close
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
          <div className="mb-6 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Read During Call
          </div>

          <div className="space-y-5">
            {scriptLines.map((line, idx) => {
              const trimmed = line.trim();

              if (!trimmed) {
                return <div key={idx} className="h-4" />;
              }

              const isCue =
                trimmed.endsWith(":") ||
                trimmed.startsWith("Objection") ||
                trimmed.startsWith("Response") ||
                trimmed.startsWith("Close") ||
                trimmed.startsWith("Question");

              return (
                <p
                  key={idx}
                  className={
                    isCue
                      ? "text-3xl font-semibold leading-[1.35] text-slate-900"
                      : "text-[2rem] leading-[1.5] text-slate-800"
                  }
                >
                  {trimmed}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}