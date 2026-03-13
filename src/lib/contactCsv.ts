export type ContactImportVertical = "coaching" | "corporate";

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
  const text = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cleanCell(cell) !== ""));
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

export function getCsvValue(
  values: Record<string, string>,
  ...keys: string[]
) {
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
  const primary_email = getCsvValue(values, "primary_email", "email", "email_address").toLowerCase();
  const phone = getCsvValue(values, "phone", "mobile", "phone_number");
  const job_title_raw = getCsvValue(values, "job_title_raw", "job_title", "title", "role");
  const sport = getCsvValue(values, "sport", "market", "focus");
  const division = getCsvValue(values, "division", "business_unit", "function");
  const conference = getCsvValue(values, "conference", "industry", "department");
  const region = getCsvValue(values, "region", "territory");
  const rep_notes = getCsvValue(values, "rep_notes", "notes", "note");

  const school_name =
    vertical === "coaching"
      ? getCsvValue(values, "school_name", "school", "organization", "org_name")
      : "";

  const account_name =
    vertical === "corporate"
      ? getCsvValue(values, "account_name", "account", "company", "company_name", "organization", "org_name")
      : "";

  return {
    first_name,
    last_name,
    primary_email,
    phone,
    job_title_raw,
    sport,
    division,
    conference,
    region,
    rep_notes,
    school_name,
    account_name,
  };
}
