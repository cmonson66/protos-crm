export type ContactImportVertical = "athletics" | "corporate";

export type ParsedCsvRow = {
  row_number: number;
  values: Record<string, string>;
};

function cleanCell(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeHeader(value: string) {
  return cleanCell(value)
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCsvText(csvText: string): ParsedCsvRow[] {
  const text = String(csvText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === `"` && next === `"`) {
        current += `"`;
        i += 1;
      } else if (ch === `"`) {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === `"`) {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (ch === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += ch;
  }

  row.push(current);
  rows.push(row);

  const nonEmptyRows = rows.filter((r) =>
    r.some((cell) => cleanCell(cell) !== "")
  );
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => normalizeHeader(h));
  const dataRows = nonEmptyRows.slice(1);

  return dataRows.map((r, idx) => {
    const values: Record<string, string> = {};
    headers.forEach((header, colIdx) => {
      if (!header) return;
      values[header] = cleanCell(r[colIdx] ?? "");
    });

    return {
      row_number: idx + 2,
      values,
    };
  });
}

export function getCsvValue(values: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    const value = cleanCell(values[normalized]);
    if (value) return value;
  }
  return "";
}

export function normalizeImportRow(
  values: Record<string, string>,
  vertical: ContactImportVertical
) {
  const first_name = getCsvValue(values, "first_name", "firstname", "first");
  const last_name = getCsvValue(values, "last_name", "lastname", "last");

  const primary_email = getCsvValue(
    values,
    "primary_email",
    "email",
    "email_address"
  ).toLowerCase();

  const phone = getCsvValue(
    values,
    "phone",
    "phone_number",
    "mobile",
    "mobile_phone",
    "mobile_number"
  );

  const linkedin_url = getCsvValue(
    values,
    "linkedin_url",
    "linkedin_profile",
    "linkedin"
  );

  const address = getCsvValue(
    values,
    "address",
    "street",
    "street_address",
    "address_1",
    "mailing_address"
  );

  const city = getCsvValue(values, "city", "town");
  const state = getCsvValue(values, "state", "province", "region_state");
  const zip = getCsvValue(values, "zip", "zipcode", "zip_code", "postal_code");

  const website = getCsvValue(
    values,
    "website",
    "web_site",
    "url",
    "site"
  );

  const job_title_raw = getCsvValue(
    values,
    "job_title_raw",
    "job_title",
    "title",
    "role"
  );

  const job_function = getCsvValue(values, "job_function", "function");
  const management_level = getCsvValue(values, "management_level");

  const sport =
    vertical === "athletics"
      ? getCsvValue(values, "sport", "market", "focus")
      : "";

  const division =
    vertical === "athletics"
      ? getCsvValue(values, "division")
      : "";

  const conference =
    vertical === "athletics"
      ? getCsvValue(values, "conference")
      : "";

  const region = getCsvValue(values, "region", "territory");
  const rep_notes = getCsvValue(values, "rep_notes", "notes", "note");

  const school_name =
    vertical === "athletics"
      ? getCsvValue(values, "school_name", "school", "organization", "org_name")
      : "";

  const account_name =
    vertical === "corporate"
      ? getCsvValue(
          values,
          "account_name",
          "account",
          "company",
          "company_name",
          "organization",
          "org_name"
        )
      : "";

  const account_website =
    vertical === "corporate"
      ? getCsvValue(values, "account_website", "website", "company_website")
      : "";

  const account_employee_count =
    vertical === "corporate"
      ? getCsvValue(values, "account_employee_count", "employee_count")
      : "";

  const account_industry =
    vertical === "corporate"
      ? getCsvValue(values, "account_industry", "industry")
      : "";

  const account_address =
    vertical === "corporate"
      ? getCsvValue(values, "account_address", "company_address")
      : "";

  const account_city =
    vertical === "corporate"
      ? getCsvValue(values, "account_city", "company_city")
      : "";

  const account_state =
    vertical === "corporate"
      ? getCsvValue(values, "account_state", "company_state")
      : "";

  const status = getCsvValue(values, "status") || "New";
  const cadence_status = getCsvValue(values, "cadence_status") || "Not Started";
  const assigned_to_user_id = getCsvValue(values, "assigned_to_user_id");
  const source = getCsvValue(values, "source");
  const import_batch = getCsvValue(values, "import_batch");

  return {
    first_name,
    last_name,
    primary_email,
    phone,
    linkedin_url,
    address,
    city,
    state,
    zip,
    website,
    job_title_raw,
    job_function,
    management_level,
    sport,
    division,
    conference,
    region,
    rep_notes,
    school_name,
    account_name,
    account_website,
    account_employee_count,
    account_industry,
    account_address,
    account_city,
    account_state,
    status,
    cadence_status,
    assigned_to_user_id,
    source,
    import_batch,
  };
}