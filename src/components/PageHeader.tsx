"use client";

import React from "react";

export default function PageHeader({
  title,
  subtitle,
  actions,
  below,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-4xl font-semibold">{title}</div>
          {subtitle ? (
            <div className="mt-2 text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {below ? <div>{below}</div> : null}
    </div>
  );
}