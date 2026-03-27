"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

type SchoolRow = {
  id: string;
  name: string;
  tier: number | null;
};

type AccountRow = {
  id: string;
  name: string;
  industry: string | null;
  company_size: string | null;
  hq_location: string | null;
  website: string | null;
  active: boolean;
};

type CadenceRow = {
  key: string;
  name: string;
  vertical: "athletics" | "corporate";
  is_active: boolean;
  updated_at: string | null;
};

type ContactVertical = "athletics" | "corporate";

const STATUS_OPTIONS = [
  "New",
  "Secured/Active",
  "Closed/Do Not Contact",
] as const;

function normalizeEntityText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function NewContactPage() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [duplicateContact, setDuplicateContact] = useState<{
    id: string;
    name: string | null;
    email: string | null;
    school_name: string | null;
    duplicate_type: string | null;
  } | null>(null);

  const [reps, setReps] = useState<RepRow[]>([]);
  const [canAssign, setCanAssign] = useState(false);

  const [vertical, setVertical] = useState<ContactVertical>("athletics");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [zip, setZip] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [sport, setSport] = useState("");
  const [division, setDivision] = useState("");
  const [conference, setConference] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<string>("New");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [repNotes, setRepNotes] = useState("");

  const [cadences, setCadences] = useState<CadenceRow[]>([]);
  const [cadenceLoading, setCadenceLoading] = useState(false);
  const [selectedCadenceKey, setSelectedCadenceKey] = useState("");

  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState<SchoolRow[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRow | null>(null);

  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<AccountRow[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  const [decisionLevel, setDecisionLevel] = useState("");
  const [department, setDepartment] = useState("");
  const [budgetOwner, setBudgetOwner] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    async function loadReps() {
      const res = await fetchWithAuth("/api/reps/list");
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setReps((json.data ?? []) as RepRow[]);
        setCanAssign(true);
      } else {
        setReps([]);
        setCanAssign(false);
      }
    }

    void loadReps();
  }, []);

  useEffect(() => {
    async function loadCadences() {
      setCadenceLoading(true);

      const res = await fetchWithAuth(
        `/api/cadence/list?vertical=${encodeURIComponent(vertical)}`
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setCadences((json.data ?? []) as CadenceRow[]);
      } else {
        setCadences([]);
      }

      setCadenceLoading(false);
    }

    void loadCadences();
  }, [vertical]);

  useEffect(() => {
    const q = schoolQuery.trim();

    if (!q || vertical !== "athletics") {
      setSchoolResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSchoolLoading(true);

      const res = await fetchWithAuth(
        `/api/schools/search?q=${encodeURIComponent(q)}`
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setSchoolResults((json.data ?? []) as SchoolRow[]);
      } else {
        setSchoolResults([]);
      }

      setSchoolLoading(false);
    }, 250);

    return () => clearTimeout(t);
  }, [schoolQuery, vertical]);

  useEffect(() => {
    const q = accountQuery.trim();

    if (!q || vertical !== "corporate") {
      setAccountResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setAccountLoading(true);

      const res = await fetchWithAuth(
        `/api/accounts/search?q=${encodeURIComponent(q)}`
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setAccountResults((json.data ?? []) as AccountRow[]);
      } else {
        setAccountResults([]);
      }

      setAccountLoading(false);
    }, 250);

    return () => clearTimeout(t);
  }, [accountQuery, vertical]);

  useEffect(() => {
    setErr(null);
    setDuplicateContact(null);
    setSelectedCadenceKey("");

    if (vertical === "athletics") {
      setSelectedAccount(null);
      setAccountQuery("");
      setAccountResults([]);
      setDecisionLevel("");
      setDepartment("");
      setBudgetOwner(false);
    } else {
      setSelectedSchool(null);
      setSchoolQuery("");
      setSchoolResults([]);
    }
  }, [vertical]);

  const showSchoolResults = useMemo(() => {
    return (
      vertical === "athletics" &&
      schoolQuery.trim().length > 0 &&
      !selectedSchool
    );
  }, [vertical, schoolQuery, selectedSchool]);

  const showAccountResults = useMemo(() => {
    return (
      vertical === "corporate" &&
      accountQuery.trim().length > 0 &&
      !selectedAccount
    );
  }, [vertical, accountQuery, selectedAccount]);

  const normalizedSchoolQuery = useMemo(
    () => normalizeEntityText(schoolQuery),
    [schoolQuery]
  );

  const exactSchoolMatch = useMemo(() => {
    if (!normalizedSchoolQuery) return null;

    return (
      schoolResults.find(
        (school) => normalizeEntityText(school.name) === normalizedSchoolQuery
      ) ?? null
    );
  }, [schoolResults, normalizedSchoolQuery]);

  const normalizedAccountQuery = useMemo(
    () => normalizeEntityText(accountQuery),
    [accountQuery]
  );

  const exactAccountMatch = useMemo(() => {
    if (!normalizedAccountQuery) return null;

    return (
      accountResults.find(
        (account) => normalizeEntityText(account.name) === normalizedAccountQuery
      ) ?? null
    );
  }, [accountResults, normalizedAccountQuery]);

  const cadenceCountLabel = cadenceLoading
    ? "Loading cadences..."
    : `${cadences.length} available`;

  const repAssignmentLabel = canAssign
    ? "Manager/admin assignment available"
    : "This contact will default to your ownership";

  async function createSchoolFromQuery() {
    const rawName = schoolQuery.trim();
    if (!rawName) return;

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/schools/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: rawName,
        tier: null,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to create school");
      setBusy(false);
      return;
    }

    if (json?.school) {
      setSelectedSchool(json.school as SchoolRow);
      setSchoolQuery("");
      setSchoolResults([]);
      setToast(json?.created ? "School created" : "Existing school selected");
    }

    setBusy(false);
  }

  async function createAccountFromQuery() {
    const rawName = accountQuery.trim();
    if (!rawName) return;

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/accounts/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: rawName,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to create account");
      setBusy(false);
      return;
    }

    if (json?.account) {
      setSelectedAccount(json.account as AccountRow);
      setAccountQuery("");
      setAccountResults([]);
      setToast(json?.created ? "Account created" : "Existing account selected");
    }

    setBusy(false);
  }

  async function createContact() {
    setBusy(true);
    setErr(null);
    setDuplicateContact(null);

    const res = await fetchWithAuth("/api/contacts/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vertical,
        school_id: vertical === "athletics" ? selectedSchool?.id ?? null : null,
        account_id: vertical === "corporate" ? selectedAccount?.id ?? null : null,
        first_name: firstName,
        last_name: lastName,
        primary_email: email,
        job_title_raw: jobTitle,
        phone,
        address,
        city,
        state: stateValue,
        zip,
        website,
        linkedin_url: linkedinUrl,
        sport,
        division,
        conference,
        region,
        status,
        cadence_key: selectedCadenceKey || null,
        assigned_to_user_id: canAssign ? assignedToUserId || null : null,
        rep_notes: repNotes,
        profile:
          vertical === "corporate"
            ? {
                decision_level: decisionLevel || null,
                department: department || null,
                budget_owner: budgetOwner,
              }
            : {},
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 409 && json?.code === "duplicate_contact") {
        setErr(json?.error ?? "Possible duplicate contact found.");
        setDuplicateContact({
          id: json?.existing_contact?.id ?? "",
          name: json?.existing_contact?.name ?? null,
          email: json?.existing_contact?.email ?? null,
          school_name: json?.existing_contact?.school_name ?? null,
          duplicate_type: json?.duplicate_type ?? null,
        });
      } else {
        setErr(json?.error ?? "Failed to create contact");
      }

      setBusy(false);
      return;
    }

    setToast("Contact created");
    setBusy(false);

    if (json?.contact_id) {
      router.push(`/contacts/${json.contact_id}`);
      return;
    }

    router.push("/contacts");
  }

  return (
    <div className="space-y-8 p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{toast}</div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-orange-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="text-3xl font-semibold tracking-tight text-slate-900">
                New Contact
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2.5">
  <span
    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm ${
      vertical === "corporate"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : "border-sky-200 bg-sky-50 text-sky-700"
    }`}
  >
    {vertical}
  </span>

  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm">
    {cadenceCountLabel}
  </span>

  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm">
    {repAssignmentLabel}
  </span>
</div>

              <div className="mt-3 text-sm text-slate-600">
                Add a new prospect or operating contact into the CRM.
              </div>

              <div className="mt-2 text-sm text-slate-500">
                {vertical === "athletics"
                  ? "Athletics contacts attach to schools and use athletics cadences."
                  : "Corporate contacts attach to accounts and use corporate cadences."}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="crm-button px-4 py-2"
                onClick={() => router.push("/contacts")}
              >
                Back
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/60 bg-white/40 px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Contact Type
            </div>
            <div className="mt-2 text-lg font-semibold capitalize text-slate-900">
              {vertical}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Initial Status
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {status}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Cadence
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {selectedCadenceKey || "None selected"}
            </div>
          </div>

          <div className="crm-card-soft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Assignment
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {canAssign
                ? assignedToUserId
                  ? reps.find((r) => r.user_id === assignedToUserId)?.full_name ||
                    reps.find((r) => r.user_id === assignedToUserId)?.email ||
                    "Assigned"
                  : "Unassigned"
                : "Auto-owner"}
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="space-y-3">
          <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
            {err}
          </div>

          {duplicateContact?.id ? (
            <div className="crm-card border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                Possible duplicate found
              </div>

              <div className="mt-2 text-sm text-amber-800">
                {duplicateContact.name || "Existing contact"}
                {duplicateContact.school_name
                  ? ` • ${duplicateContact.school_name}`
                  : ""}
                {duplicateContact.email ? ` • ${duplicateContact.email}` : ""}
              </div>

              <div className="mt-1 text-xs text-amber-700">
                Match type: {duplicateContact.duplicate_type || "duplicate"}
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  className="crm-button px-4 py-2 text-sm"
                  onClick={() => router.push(`/contacts/${duplicateContact.id}`)}
                >
                  Open Existing Contact
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Contact Type
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Choose the operating model before entering org-specific fields.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setVertical("athletics")}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                vertical === "athletics"
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Athletics
            </button>

            <button
              type="button"
              onClick={() => setVertical("corporate")}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                vertical === "corporate"
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Corporate
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="crm-card p-6">
            <div className="text-lg font-semibold text-slate-900">Identity</div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    First Name
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Last Name
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder="Phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Job Title
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder={
                      vertical === "corporate"
                        ? "Job title / role"
                        : "Job title"
                    }
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Street Address
                </label>
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder="Street address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    City
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    State
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder="State"
                    value={stateValue}
                    onChange={(e) => setStateValue(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Zip
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder="Zip"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Website
                </label>
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder="Website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

                            <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  LinkedIn URL
                </label>
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder="https://www.linkedin.com/in/..."
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>

              {vertical === "athletics" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    School
                  </label>

                  {selectedSchool ? (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm text-slate-700">
                        <span className="font-medium">{selectedSchool.name}</span>
                        {selectedSchool.tier
                          ? ` • Tier ${selectedSchool.tier}`
                          : ""}
                      </div>
                      <button
                        type="button"
                        className="text-xs text-slate-600 hover:text-slate-900"
                        onClick={() => {
                          setSelectedSchool(null);
                          setSchoolQuery("");
                          setSchoolResults([]);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        className="crm-input w-full px-3 py-2"
                        placeholder="Search school name..."
                        value={schoolQuery}
                        onChange={(e) => setSchoolQuery(e.target.value)}
                      />

                      {showSchoolResults ? (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {schoolLoading ? (
                            <div className="px-3 py-2 text-sm text-slate-500">
                              Searching...
                            </div>
                          ) : (
                            <>
                              {schoolResults.length > 0 ? (
                                schoolResults.map((school) => (
                                  <button
                                    key={school.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSchool(school);
                                      setSchoolQuery("");
                                      setSchoolResults([]);
                                    }}
                                    className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                                  >
                                    <div className="text-sm font-medium text-slate-900">
                                      {school.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {school.tier
                                        ? `Tier ${school.tier}`
                                        : "No tier"}
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <div className="border-b border-slate-100 px-3 py-2 text-sm text-slate-500">
                                  No schools found.
                                </div>
                              )}

                              {!exactSchoolMatch && schoolQuery.trim() ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={createSchoolFromQuery}
                                  className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Create school:{" "}
                                  <span className="font-semibold">
                                    {schoolQuery.trim()}
                                  </span>
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Account / Company
                  </label>

                  {selectedAccount ? (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm text-slate-700">
                        <span className="font-medium">{selectedAccount.name}</span>
                        {selectedAccount.industry
                          ? ` • ${selectedAccount.industry}`
                          : ""}
                      </div>
                      <button
                        type="button"
                        className="text-xs text-slate-600 hover:text-slate-900"
                        onClick={() => {
                          setSelectedAccount(null);
                          setAccountQuery("");
                          setAccountResults([]);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        className="crm-input w-full px-3 py-2"
                        placeholder="Search account/company..."
                        value={accountQuery}
                        onChange={(e) => setAccountQuery(e.target.value)}
                      />

                      {showAccountResults ? (
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {accountLoading ? (
                            <div className="px-3 py-2 text-sm text-slate-500">
                              Searching...
                            </div>
                          ) : (
                            <>
                              {accountResults.length > 0 ? (
                                accountResults.map((account) => (
                                  <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedAccount(account);
                                      setAccountQuery("");
                                      setAccountResults([]);
                                    }}
                                    className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                                  >
                                    <div className="text-sm font-medium text-slate-900">
                                      {account.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {[
                                        account.industry,
                                        account.company_size,
                                        account.hq_location,
                                      ]
                                        .filter(Boolean)
                                        .join(" • ") || "Company"}
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <div className="border-b border-slate-100 px-3 py-2 text-sm text-slate-500">
                                  No accounts found.
                                </div>
                              )}

                              {!exactAccountMatch && accountQuery.trim() ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={createAccountFromQuery}
                                  className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Create account:{" "}
                                  <span className="font-semibold">
                                    {accountQuery.trim()}
                                  </span>
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {vertical === "corporate" ? (
            <div className="crm-card p-6">
              <div className="text-lg font-semibold text-slate-900">
                Corporate Buying Context
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Department
                    </label>
                    <input
                      className="crm-input w-full px-3 py-2"
                      placeholder="Department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Decision Level
                    </label>
                    <input
                      className="crm-input w-full px-3 py-2"
                      placeholder="Decision level"
                      value={decisionLevel}
                      onChange={(e) => setDecisionLevel(e.target.value)}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={budgetOwner}
                    onChange={(e) => setBudgetOwner(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">Budget owner</span>
                </label>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="crm-card p-6">
            <div className="text-lg font-semibold text-slate-900">
              {vertical === "athletics" ? "Program / Pipeline" : "Pipeline"}
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  {vertical === "athletics"
                    ? "Sport"
                    : "Market / Segment / Focus"}
                </label>
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder={
                    vertical === "athletics"
                      ? "Sport"
                      : "Market / Segment / Focus"
                  }
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    {vertical === "athletics"
                      ? "Division"
                      : "Division / Business Unit"}
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder={
                      vertical === "athletics"
                        ? "Division"
                        : "Division / Business Unit"
                    }
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    {vertical === "athletics"
                      ? "Conference"
                      : "Industry / Subsector"}
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder={
                      vertical === "athletics"
                        ? "Conference"
                        : "Industry / Subsector"
                    }
                    value={conference}
                    onChange={(e) => setConference(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    {vertical === "athletics"
                      ? "Region"
                      : "Region / Territory"}
                  </label>
                  <input
                    className="crm-input w-full px-3 py-2"
                    placeholder={
                      vertical === "athletics"
                        ? "Region"
                        : "Region / Territory"
                    }
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  className="crm-input w-full px-3 py-2"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Cadence
                </label>
                <select
                  className="crm-input w-full px-3 py-2"
                  value={selectedCadenceKey}
                  onChange={(e) => setSelectedCadenceKey(e.target.value)}
                  disabled={cadenceLoading}
                >
                  <option value="">
                    {cadenceLoading ? "Loading cadences..." : "No cadence assigned"}
                  </option>
                  {cadences.map((cadence) => (
                    <option key={cadence.key} value={cadence.key}>
                      {cadence.name || cadence.key}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-slate-500">
                  Only {vertical} cadences are shown here.
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Assignment
                </label>

                {canAssign ? (
                  <select
                    className="crm-input w-full px-3 py-2"
                    value={assignedToUserId}
                    onChange={(e) => setAssignedToUserId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {reps
                      .filter((r) => r.is_active)
                      .map((r) => (
                        <option key={r.user_id} value={r.user_id}>
                          {r.full_name || r.email || r.user_id}
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    This contact will be assigned to you automatically.
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Notes / Context
                </label>
                <textarea
                  className="crm-input min-h-[140px] w-full px-3 py-2"
                  placeholder="Notes / source / prospecting context"
                  value={repNotes}
                  onChange={(e) => setRepNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="crm-card p-6">
            <div className="text-lg font-semibold text-slate-900">
              Create Contact
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Review the form and create the record when ready.
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="crm-button-primary px-5 py-3"
                disabled={busy}
                onClick={createContact}
              >
                {busy ? "Creating..." : "Create Contact"}
              </button>

              <button
                className="crm-button px-5 py-3"
                onClick={() => router.push("/contacts")}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}