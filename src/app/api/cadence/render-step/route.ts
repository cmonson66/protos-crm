import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function coachSalutation(firstName?: string | null, lastName?: string | null) {
  const ln = (lastName || "").trim();
  if (ln) return `Coach ${ln}`;

  const fn = (firstName || "").trim();
  if (fn) return `Coach ${fn}`;

  return "Coach";
}

function normalizeTemplateText(s: string) {
  return (s || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function renderTemplate(
  s: string,
  vars: Record<string, string | null | undefined>
) {
  let out = normalizeTemplateText(s);

  for (const [k, v] of Object.entries(vars)) {
    const safe = (v ?? "").toString();
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi");
    out = out.replace(re, safe);
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const contact_id = (url.searchParams.get("contact_id") || "").trim();
    const cadence_key_override = (url.searchParams.get("cadence_key") || "").trim();
    const step_override_raw = (url.searchParams.get("step") || "").trim();

    if (!contact_id) {
      return NextResponse.json(
        { error: "contact_id is required" },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user?.id) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    const { data: c, error: cErr } = await supabase
      .from("contacts")
      .select(
        `
        id,
        first_name,
        last_name,
        primary_email,
        status,
        cadence_key,
        cadence_step,
        cadence_status,
        cadence_next_due_at,
        schools(name)
      `
      )
      .eq("id", contact_id)
      .maybeSingle();

    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 400 });
    }

    if (!c) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const cadenceKey =
      cadence_key_override || (c.cadence_key as string | null) || "";

    if (!cadenceKey) {
      return NextResponse.json(
        { error: "No cadence key available for preview" },
        { status: 400 }
      );
    }

    let stepToRender = 1;

    if (step_override_raw) {
      const parsed = Number(step_override_raw);
      stepToRender = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    } else {
      const savedStep = Number(c.cadence_step ?? 0);
      stepToRender = savedStep > 0 ? savedStep : 1;
    }

    const { data: tmpl, error: tErr } = await supabase
      .from("cadence_template_steps")
      .select(
        `
        cadence_key,
        step,
        name,
        subject,
        body,
        due_offset_days,
        required_contact_status,
        is_active
      `
      )
      .eq("cadence_key", cadenceKey)
      .eq("step", stepToRender)
      .eq("is_active", true)
      .maybeSingle();

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 400 });
    }

    if (!tmpl) {
      return NextResponse.json(
        {
          error: `No active template found for cadence_key=${cadenceKey} step=${stepToRender}`,
        },
        { status: 404 }
      );
    }

    const coachName = coachSalutation(c.first_name, c.last_name);

    const vars = {
      first_name: coachName,
      coach_name: coachName,
      last_name: c.last_name ?? "",
      school_name: c.schools?.name ?? "",
      email: c.primary_email ?? "",
    };

    const subject = renderTemplate(tmpl.subject || "", vars);
    const body = renderTemplate(tmpl.body || "", vars);

    return NextResponse.json({
      ok: true,
      cadence_key: cadenceKey,
      step: stepToRender,
      required_contact_status: tmpl.required_contact_status ?? null,
      subject,
      body,
      to_email: c.primary_email ?? null,
      contact_status: c.status,
      cadence_status: c.cadence_status,
      cadence_next_due_at: c.cadence_next_due_at,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}