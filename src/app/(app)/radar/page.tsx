"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import PriorityRadarBoard, { RadarContact } from "@/components/PriorityRadarBoard";

type RadarResponse = {
  data: RadarContact[];
  count: number;
};

export default function RadarPage() {
  const [radar, setRadar] = useState<RadarContact[]>([]);
  const [radarLoading, setRadarLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const radarDisplay = useMemo(() => radar, [radar]);

  async function fetchRadar() {
    setRadarLoading(true);
    setErr(null);

    try {
      const res = await fetchWithAuth("/api/contacts/radar?limit=50");
      const json = (await res.json().catch(() => ({}))) as Partial<RadarResponse> & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load priority radar");
      }

      setRadar((json.data ?? []) as RadarContact[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load priority radar");
      setRadar([]);
    } finally {
      setRadarLoading(false);
    }
  }

  async function promoteRadarContact(contactId: string) {
    setPromotingId(contactId);
    setErr(null);

    try {
      const res = await fetchWithAuth("/api/tasks/promote-contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to promote contact");
      }

      await fetchRadar();
    } catch (e: any) {
      setErr(e?.message || "Failed to promote contact");
    } finally {
      setPromotingId(null);
    }
  }

  useEffect(() => {
    void fetchRadar();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Priority Radar"
        subtitle="Dynamic ranking of the highest-value contacts to work next."
      />

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <PriorityRadarBoard
            title="Priority Radar Board"
            subtitle="Top 50 coaching + corporate contacts by priority score."
            radar={radarDisplay}
            radarLoading={radarLoading}
            promotingId={promotingId}
            onRefresh={() => void fetchRadar()}
            onPromote={(contactId) => void promoteRadarContact(contactId)}
            maxHeightClassName="max-h-[calc(100vh-260px)]"
          />
        </CardContent>
      </Card>
    </div>
  );
}