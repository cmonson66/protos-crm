import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canAssignContact,
  canCreateContact,
  getRole,
  requireUser,
} from "@/lib/apiAuth";
import {
  ContactImportVertical,
  normalizeImportRow,
  parseCsvText,
} from "@/lib/contactCsv";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeName(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

async function resolveOrCreateSchool(name: string) {
  const { data: schools, error: schoolFindErr } = await supabaseAdmin
    .from("schools")
    .select("id, name, tier")
    .ilike("name", name)
    .limit(1);

  if (schoolFindErr) throw new Error(schoolFindErr.message);
  if ((schools ?? []).length > 0) return (schools ?? [])[0] as any;

  const { data: created, error: createErr } = await supabaseAdmin
    .from("schools")
    .insert({ name, tier: null })
    .select("id, name, tier")
    .single();

  if (createErr) throw new Error(createErr.message);
  return created as any;
}

async function resolveOrCreateAccount(name: string) {
  const { data: accounts, error: accountFindErr } = await supabaseAdmin
    .from("accounts")
    .select("id, name")
    .ilike("name", name)
    .limit(1);

  if (accountFindErr) throw new Error(accountFindErr.message);
  if ((accounts ?? []).length > 0) return (accounts ?? [])[0] as any;

  const { data: created, error: createErr } = await supabaseAdmin
    .from("accounts")
    .insert({ name })
    .select("id, name")
    .single();

  if (createErr) throw new Error(createErr.message);
  return created as any;
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  if (!is_active) {
    return NextResponse.json({ error: "User inactive" }, { status: 403 });
  }

  if (!canCreateContact(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const csv_text = String(body?.csv_text || "");
  const vertical =
    body?.vertical === "corporate" ? "corporate" : "coaching";
  const status = clean(body?.status || "New");
  const cadence_key = clean(body?.cadence_key || "");
  const auto_create_organizations = Boolean(body?.auto_create_organizations);

  let assigned_to_user_id = clean(body?.assigned_to_user_id || "");
  if (!canAssignContact(role)) {
    assigned_to_user_id = me;
  }

  if (!csv_text.trim()) {
    return NextResponse.json({ error: "csv_text is required" }, { status: 400 });
  }

  if (
    status !== "New" &&
    status !== "Secured/Active" &&
    status !== "Closed/Do Not Contact"
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const parsedRows = parseCsvText(csv_text);
  if (parsedRows.length === 0) {
    return NextResponse.json({ error: "No CSV rows found" }, { status: 400 });
  }

  let step1: any = null;
  if (cadence_key) {
    const { data: cadenceStep, error: cadenceErr } = await supabaseAdmin
      .from("cadence_template_steps")
      .select(`
        cadence_key,
        vertical,
        step,
        subject,
        body,
        due_offset_days,
        required_contact_status,
        is_active
      `)
      .eq("cadence_key", cadence_key)
      .eq("step", 1)
      .eq("is_active", true)
      .maybeSingle();

    if (cadenceErr) {
      return NextResponse.json({ error: cadenceErr.message }, { status: 500 });
    }

    if (!cadenceStep) {
      return NextResponse.json(
        { error: "Selected cadence step 1 not found or inactive" },
        { status: 400 }
      );
    }

    if ((cadenceStep as any).vertical !== vertical) {
      return NextResponse.json(
        { error: "Selected cadence does not match import vertical" },
        { status: 400 }
      );
    }

    step1 = cadenceStep;
  }

  const normalizedRows = parsedRows.map((row) => ({
    row_number: row.row_number,
    ...normalizeImportRow(row.values, vertical as ContactImportVertical),
  }));

  const results: Array<{
    row_number: number;
    ok: boolean;
    contact_id?: string;
    message: string;
  }> = [];

  const seenEmailsInFile = new Set<string>();

  for (const row of normalizedRows) {
    try {
      if (!row.first_name && !row.last_name && !row.primary_email) {
        results.push({
          row_number: row.row_number,
          ok: false,
          message: "Missing name/email identity fields",
        });
        continue;
      }

      if (!row.sport) {
        results.push({
          row_number: row.row_number,
          ok: false,
          message: "sport is required",
        });
        continue;
      }

      const orgName =
        vertical === "coaching" ? row.school_name : row.account_name;

      if (!orgName) {
        results.push({
          row_number: row.row_number,
          ok: false,
          message:
            vertical === "coaching"
              ? "school_name is required"
              : "account_name is required",
        });
        continue;
      }

      if (row.primary_email) {
        const emailKey = row.primary_email.toLowerCase();

        if (seenEmailsInFile.has(emailKey)) {
          results.push({
            row_number: row.row_number,
            ok: false,
            message: "Duplicate email appears multiple times in this file",
          });
          continue;
        }

        seenEmailsInFile.add(emailKey);

        const { data: existingContact, error: dupErr } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .ilike("primary_email", row.primary_email)
          .limit(1)
          .maybeSingle();

        if (dupErr) throw new Error(dupErr.message);

        if (existingContact) {
          results.push({
            row_number: row.row_number,
            ok: false,
            message: "Duplicate existing email",
          });
          continue;
        }
      }

      let school_id: string | null = null;
      let account_id: string | null = null;

      if (vertical === "coaching") {
        const { data: schools, error: schoolErr } = await supabaseAdmin
          .from("schools")
          .select("id, name")
          .ilike("name", row.school_name)
          .limit(1);

        if (schoolErr) throw new Error(schoolErr.message);

        if ((schools ?? []).length > 0) {
          school_id = String((schools ?? [])[0].id);
        } else if (auto_create_organizations) {
          const created = await resolveOrCreateSchool(row.school_name);
          school_id = String(created.id);
        } else {
          results.push({
            row_number: row.row_number,
            ok: false,
            message: "School not found",
          });
          continue;
        }
      } else {
        const { data: accounts, error: accountErr } = await supabaseAdmin
          .from("accounts")
          .select("id, name")
          .ilike("name", row.account_name)
          .limit(1);

        if (accountErr) throw new Error(accountErr.message);

        if ((accounts ?? []).length > 0) {
          account_id = String((accounts ?? [])[0].id);
        } else if (auto_create_organizations) {
          const created = await resolveOrCreateAccount(row.account_name);
          account_id = String(created.id);
        } else {
          results.push({
            row_number: row.row_number,
            ok: false,
            message: "Account not found",
          });
          continue;
        }
      }

      const nowIso = new Date().toISOString();

      let cadence_step = 0;
      let cadence_status = "inactive";
      let cadence_next_due_at: string | null = null;
      let cadence_started_at: string | null = null;
      let cadence_updated_at: string | null = null;

      if (
        step1 &&
        status === "New" &&
        String(step1.required_contact_status || "New") === "New"
      ) {
        cadence_step = 1;
        cadence_status = "active";
        cadence_started_at = nowIso;
        cadence_updated_at = nowIso;
        cadence_next_due_at = addDays(
          new Date(),
          Number(step1.due_offset_days || 0)
        ).toISOString();
      }

      const insertRow = {
        vertical,
        school_id,
        account_id,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        primary_email: row.primary_email || null,
        phone: row.phone || null,
        job_title_raw: row.job_title_raw || null,
        sport: row.sport,
        division: row.division || null,
        conference: row.conference || null,
        region: row.region || null,
        owner_user_id: me,
        assigned_to_user_id: assigned_to_user_id || null,
        status,
        active: true,
        rep_notes: row.rep_notes || null,
        cadence_key: cadence_step > 0 ? cadence_key : null,
        cadence_step,
        cadence_status,
        cadence_next_due_at,
        cadence_started_at,
        cadence_updated_at,
        last_activity_at: null,
        last_activity_type: null,
        last_activity_subject: null,
      };

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("contacts")
        .insert(insertRow)
        .select("id")
        .single();

      if (insertErr) throw new Error(insertErr.message);

      const contact_id = String(inserted.id);

      await supabaseAdmin.from("contact_profiles").upsert({
        contact_id,
        profile: {},
        updated_at: nowIso,
      });

      await supabaseAdmin.from("activities").insert({
        contact_id,
        user_id: me,
        type: "note",
        occurred_at: nowIso,
        subject: "Contact imported",
        body:
          vertical === "corporate"
            ? "Corporate contact imported via CSV."
            : "Coaching contact imported via CSV.",
      });

      if (step1 && cadence_step === 1 && cadence_next_due_at) {
        await supabaseAdmin.from("tasks").insert({
          contact_id,
          assigned_to_user_id: assigned_to_user_id || me,
          owner_user_id: me,
          task_type: "email",
          due_at: cadence_next_due_at,
          title: step1.subject,
          notes: step1.body,
          status: "open",
          kind: "cadence",
          cadence_key,
          cadence_step: 1,
        });
      }

      results.push({
        row_number: row.row_number,
        ok: true,
        contact_id,
        message: "Imported",
      });
    } catch (e: any) {
      results.push({
        row_number: row.row_number,
        ok: false,
        message: e?.message || "Import failed",
      });
    }
  }

  const imported_count = results.filter((r) => r.ok).length;
  const skipped_count = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    summary: {
      total_rows: results.length,
      imported_count,
      skipped_count,
    },
    results,
  });
}
