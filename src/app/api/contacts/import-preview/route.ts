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
  const vertical: ContactImportVertical =
    body?.vertical === "corporate" ? "corporate" : "athletics";
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

  if (cadence_key) {
    const { data: cadenceStep, error: cadenceErr } = await supabaseAdmin
      .from("cadence_template_steps")
      .select("cadence_key, vertical, step, is_active")
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
  }

  const normalized = parsedRows.map((row) => ({
    row_number: row.row_number,
    ...normalizeImportRow(row.values, vertical),
  }));

  const emails = Array.from(
    new Set(
      normalized
        .map((r) => r.primary_email)
        .filter(Boolean)
        .map((x) => x.toLowerCase())
    )
  );

  const orgNames = Array.from(
    new Set(
      normalized
        .map((r) => (vertical === "athletics" ? r.school_name : r.account_name))
        .filter(Boolean)
        .map((x) => normalizeName(x))
    )
  );

  const existingContactsByEmail = new Map<string, { id: string; name: string }>();
  if (emails.length > 0) {
    const { data: existingContacts, error: contactsErr } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, primary_email")
      .in("primary_email", emails);

    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    for (const row of existingContacts ?? []) {
      existingContactsByEmail.set(String(row.primary_email || "").toLowerCase(), {
        id: String(row.id),
        name:
          `${row.first_name || ""} ${row.last_name || ""}`.trim() || "(No name)",
      });
    }
  }

  let existingOrganizations = new Set<string>();
  if (orgNames.length > 0) {
    if (vertical === "athletics") {
      const { data: schools, error: schoolsErr } = await supabaseAdmin
        .from("schools")
        .select("id, name");

      if (schoolsErr) {
        return NextResponse.json({ error: schoolsErr.message }, { status: 500 });
      }

      existingOrganizations = new Set(
        (schools ?? []).map((s) => normalizeName((s as any).name))
      );
    } else {
      const { data: accounts, error: accountsErr } = await supabaseAdmin
        .from("accounts")
        .select("id, name");

      if (accountsErr) {
        return NextResponse.json({ error: accountsErr.message }, { status: 500 });
      }

      existingOrganizations = new Set(
        (accounts ?? []).map((a) => normalizeName((a as any).name))
      );
    }
  }

  const fileDuplicateCounts = new Map<string, number>();
  for (const row of normalized) {
    if (!row.primary_email) continue;
    const key = row.primary_email.toLowerCase();
    fileDuplicateCounts.set(key, (fileDuplicateCounts.get(key) || 0) + 1);
  }

  const previewRows = normalized.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!row.first_name && !row.last_name && !row.primary_email) {
      errors.push("At least one of first_name, last_name, or primary_email is required");
    }

    const orgName = vertical === "athletics" ? row.school_name : row.account_name;

    if (!orgName) {
      errors.push(
        vertical === "athletics"
          ? "school_name is required"
          : "account_name is required"
      );
    }

    if (vertical === "athletics" && !row.sport) {
      errors.push("sport is required for athletics imports");
    }

    if (row.primary_email && existingContactsByEmail.has(row.primary_email.toLowerCase())) {
      const existing = existingContactsByEmail.get(row.primary_email.toLowerCase())!;
      errors.push(`Duplicate existing email (${existing.name})`);
    }

    if (
      row.primary_email &&
      (fileDuplicateCounts.get(row.primary_email.toLowerCase()) || 0) > 1
    ) {
      errors.push("Duplicate email appears multiple times in this file");
    }

    if (orgName && !existingOrganizations.has(normalizeName(orgName))) {
      if (auto_create_organizations) {
        warnings.push(
          vertical === "athletics"
            ? "School will be auto-created"
            : "Account will be auto-created"
        );
      } else {
        errors.push(vertical === "athletics" ? "School not found" : "Account not found");
      }
    }

    return {
      row_number: row.row_number,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      primary_email: row.primary_email || "",
      phone: row.phone || "",
      linkedin_url: row.linkedin_url || "",
      address: clean(row.address),
      city: clean(row.city),
      state: clean(row.state),
      zip: clean(row.zip),
      website: clean(row.website),
      job_title_raw: row.job_title_raw || "",
      job_function: row.job_function || "",
      management_level: row.management_level || "",
      sport: row.sport || "",
      division: row.division || "",
      conference: row.conference || "",
      region: row.region || "",
      rep_notes: row.rep_notes || "",
      school_name: row.school_name || "",
      account_name: row.account_name || "",
      account_website: row.account_website || "",
      account_employee_count: row.account_employee_count || "",
      account_industry: row.account_industry || "",
      account_address: row.account_address || "",
      account_city: row.account_city || "",
      account_state: row.account_state || "",
      status: row.status || status,
      cadence_status: row.cadence_status || "",
      assigned_to_user_id: row.assigned_to_user_id || assigned_to_user_id || "",
      source: row.source || "",
      import_batch: row.import_batch || "",
      ready: errors.length === 0,
      errors,
      warnings,
    };
  });

  const ready_count = previewRows.filter((r) => r.ready).length;
  const error_count = previewRows.filter((r) => r.errors.length > 0).length;

  return NextResponse.json({
    ok: true,
    vertical,
    status,
    cadence_key: cadence_key || null,
    assigned_to_user_id: assigned_to_user_id || null,
    auto_create_organizations,
    summary: {
      total_rows: previewRows.length,
      ready_count,
      error_count,
    },
    rows: previewRows,
  });
}