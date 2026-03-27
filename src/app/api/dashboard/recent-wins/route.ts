import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUser, getManagerScopeUserIds, getRole } from "@/lib/apiAuth";

export const runtime = "nodejs";

type WinRow = {
  id: string;
  kind: "closed_won" | "meeting_booked" | "reply";
  ts: string;
  title: string;
  subtitle: string | null;
  href: string;
  amount: number | null;
};

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  const scopeUserIds = await getManagerScopeUserIds(me, role);

  const [oppsRes, actsRes] = await Promise.all([
    supabaseAdmin
      .from("v_opportunities_enriched")
      .select(
        `
        id,
        name,
        status,
        actual_revenue,
        updated_at,
        assigned_to_user_id,
        school_name,
        account_name,
        contact_first_name,
        contact_last_name
      `
      )
      .eq("status", "closed_won")
      .in("assigned_to_user_id", scopeUserIds)
      .order("updated_at", { ascending: false })
      .limit(8),

    supabaseAdmin
      .from("activities")
      .select(
        `
        id,
        contact_id,
        user_id,
        type,
        occurred_at,
        subject,
        outcome
      `
      )
      .in("user_id", scopeUserIds)
      .in("outcome", ["booked_demo", "replied"])
      .order("occurred_at", { ascending: false })
      .limit(12),
  ]);

  if (oppsRes.error) {
    return NextResponse.json({ error: oppsRes.error.message }, { status: 500 });
  }

  if (actsRes.error) {
    return NextResponse.json({ error: actsRes.error.message }, { status: 500 });
  }

  const activities = actsRes.data ?? [];
  const contactIds = Array.from(
    new Set(
      activities
        .map((a) => String(a.contact_id || "").trim())
        .filter(Boolean)
    )
  );

  let contactsById = new Map<
    string,
    {
      id: string;
      first_name: string | null;
      last_name: string | null;
      school_name: string | null;
      account_name: string | null;
    }
  >();

  if (contactIds.length > 0) {
    const contactsRes = await supabaseAdmin
      .from("contacts")
      .select(
        `
        id,
        first_name,
        last_name,
        schools(name),
        accounts!contacts_account_id_fkey(name)
      `
      )
      .in("id", contactIds);

    if (contactsRes.error) {
      return NextResponse.json({ error: contactsRes.error.message }, { status: 500 });
    }

    contactsById = new Map(
      (contactsRes.data ?? []).map((c: any) => [
        c.id,
        {
          id: c.id,
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
          school_name: c.schools?.name ?? null,
          account_name: c.accounts?.name ?? null,
        },
      ])
    );
  }

  const opportunityWins: WinRow[] = (oppsRes.data ?? []).map((o: any) => {
    const org = o.account_name || o.school_name || null;
    const person = `${o.contact_first_name || ""} ${o.contact_last_name || ""}`.trim();

    return {
      id: `opp-${o.id}`,
      kind: "closed_won",
      ts: o.updated_at,
      title: o.name || "Closed Won",
      subtitle: [org, person || null].filter(Boolean).join(" • ") || null,
      href: `/opportunities/${o.id}`,
      amount: Number(o.actual_revenue || 0),
    };
  });

  const activityWins: WinRow[] = activities.map((a: any) => {
    const c = contactsById.get(a.contact_id);
    const person = c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : "";
    const org = c?.account_name || c?.school_name || null;
    const contactLabel = person || org || "Contact";

    if (a.outcome === "booked_demo") {
      return {
        id: `act-${a.id}`,
        kind: "meeting_booked",
        ts: a.occurred_at,
        title: a.subject?.trim() || "Meeting booked",
        subtitle: [contactLabel, org && org !== contactLabel ? org : null]
          .filter(Boolean)
          .join(" • ") || null,
        href: `/contacts/${a.contact_id}`,
        amount: null,
      };
    }

    return {
      id: `act-${a.id}`,
      kind: "reply",
      ts: a.occurred_at,
      title: a.subject?.trim() || "Meaningful reply",
      subtitle: [contactLabel, org && org !== contactLabel ? org : null]
        .filter(Boolean)
        .join(" • ") || null,
      href: `/contacts/${a.contact_id}`,
      amount: null,
    };
  });

  const data = [...opportunityWins, ...activityWins]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 10);

  return NextResponse.json({ data });
}