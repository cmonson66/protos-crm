"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type ContactVertical = "athletics" | "corporate";

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

type ContactSearchRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  school_name?: string | null;
  account_name?: string | null;
  org_name?: string | null;
  vertical?: ContactVertical | null;
};

type ProductCatalogRow = {
  id: number;
  vertical: ContactVertical;
  family: string;
  category: string | null;
  subcategory: string | null;
  item_name: string;
  requires_quantity: boolean;
  requires_approval: boolean;
  allows_custom_name: boolean;
  is_active: boolean;
  sort_order: number;
};

function normalizeEntityText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCatalogLabel(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCatalogKey(value: unknown) {
  return normalizeEntityText(cleanCatalogLabel(value));
}

function dedupeCatalogLabels(values: Array<string | null | undefined>) {
  const map = new Map<string, string>();

  for (const raw of values) {
    const cleaned = cleanCatalogLabel(raw);
    if (!cleaned) continue;

    const key = normalizeCatalogKey(cleaned);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, cleaned);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function fmtContact(c: ContactSearchRow) {
  const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(No name)";
  const org = c.org_name || c.account_name || c.school_name || "";
  return org ? `${name} • ${org}` : name;
}

export default function NewOpportunityPage() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [reps, setReps] = useState<RepRow[]>([]);
  const [canAssign, setCanAssign] = useState(false);

  const [vertical, setVertical] = useState<ContactVertical>("athletics");
  const [assignedToUserId, setAssignedToUserId] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [salesStageKey, setSalesStageKey] = useState("prospecting");
  const [estimatedRevenue, setEstimatedRevenue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [qualifiedMeetingBookedAt, setQualifiedMeetingBookedAt] = useState("");

  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState<SchoolRow[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRow | null>(null);

  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<AccountRow[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactSearchRow[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactSearchRow | null>(null);

  const [catalog, setCatalog] = useState<ProductCatalogRow[]>([]);
  const [selectedFamily, setSelectedFamily] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [customProductName, setCustomProductName] = useState("");

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
    async function loadCatalog() {
      if (vertical !== "corporate") {
        setCatalog([]);
        return;
      }

      const res = await fetchWithAuth(
        `/api/opportunities/catalog?vertical=corporate`
      );
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        setCatalog((json.data ?? []) as ProductCatalogRow[]);
      } else {
        setCatalog([]);
      }
    }

    void loadCatalog();
  }, [vertical]);

  useEffect(() => {
    if (vertical === "athletics") {
      setSelectedAccount(null);
      setAccountQuery("");
      setAccountResults([]);
      setSelectedFamily("");
      setSelectedCategory("");
      setSelectedSubcategory("");
      setSelectedItemId("");
      setQuantity("");
      setCustomProductName("");
    } else {
      setSelectedSchool(null);
      setSchoolQuery("");
      setSchoolResults([]);
    }

    setSelectedContact(null);
    setContactQuery("");
    setContactResults([]);
    setErr(null);
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

      if (res.ok) setSchoolResults((json.data ?? []) as SchoolRow[]);
      else setSchoolResults([]);

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

      if (res.ok) setAccountResults((json.data ?? []) as AccountRow[]);
      else setAccountResults([]);

      setAccountLoading(false);
    }, 250);

    return () => clearTimeout(t);
  }, [accountQuery, vertical]);

  useEffect(() => {
    const q = contactQuery.trim();
    if (!q) {
      setContactResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setContactLoading(true);

      const params = new URLSearchParams();
      params.set("q", q);
      params.set("page", "1");
      params.set("pageSize", "10");
      params.set("sort_by", "updated_at");
      params.set("sort_dir", "desc");

      const res = await fetchWithAuth(`/api/contacts/list?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        const all = (json.data ?? []) as ContactSearchRow[];
        const filtered = all.filter((c) =>
          vertical === "corporate"
            ? (c.vertical || "athletics") === "corporate"
            : (c.vertical || "athletics") === "athletics"
        );
        setContactResults(filtered);
      } else {
        setContactResults([]);
      }

      setContactLoading(false);
    }, 250);

    return () => clearTimeout(t);
  }, [contactQuery, vertical]);

  const families = useMemo(() => {
    return dedupeCatalogLabels(catalog.map((x) => x.family));
  }, [catalog]);

  const categories = useMemo(() => {
    const rows = catalog.filter(
      (x) => normalizeCatalogKey(x.family) === normalizeCatalogKey(selectedFamily)
    );
    return dedupeCatalogLabels(rows.map((x) => x.category));
  }, [catalog, selectedFamily]);

  const subcategories = useMemo(() => {
    const rows = catalog.filter(
      (x) =>
        normalizeCatalogKey(x.family) === normalizeCatalogKey(selectedFamily) &&
        (selectedCategory
          ? normalizeCatalogKey(x.category) === normalizeCatalogKey(selectedCategory)
          : true)
    );

    return dedupeCatalogLabels(rows.map((x) => x.subcategory));
  }, [catalog, selectedFamily, selectedCategory]);

const itemOptions = useMemo(() => {
  const filtered = catalog.filter(
    (x) =>
      normalizeCatalogKey(x.family) === normalizeCatalogKey(selectedFamily) &&
      (selectedCategory
        ? normalizeCatalogKey(x.category) === normalizeCatalogKey(selectedCategory)
        : true) &&
      (selectedSubcategory
        ? normalizeCatalogKey(x.subcategory) ===
          normalizeCatalogKey(selectedSubcategory)
        : true)
  );

  const seen = new Set<string>();
  const deduped: ProductCatalogRow[] = [];

  for (const item of filtered) {
    const key = [
      normalizeCatalogKey(item.family),
      normalizeCatalogKey(item.category),
      normalizeCatalogKey(item.subcategory),
      normalizeCatalogKey(item.item_name),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.sort((a, b) =>
    cleanCatalogLabel(a.item_name).localeCompare(cleanCatalogLabel(b.item_name))
  );
}, [catalog, selectedFamily, selectedCategory, selectedSubcategory]);

const selectedItem = useMemo(() => {
  return itemOptions.find((x) => String(x.id) === selectedItemId) ?? null;
}, [itemOptions, selectedItemId]);

  const normalizedSchoolQuery = useMemo(
    () => normalizeEntityText(schoolQuery),
    [schoolQuery]
  );

  const exactSchoolMatch = useMemo(() => {
    if (!normalizedSchoolQuery) return null;
    return (
      schoolResults.find(
        (s) => normalizeEntityText(s.name) === normalizedSchoolQuery
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
        (a) => normalizeEntityText(a.name) === normalizedAccountQuery
      ) ?? null
    );
  }, [accountResults, normalizedAccountQuery]);

  async function createOpportunity() {
    setBusy(true);
    setErr(null);

    const estimated = Number(estimatedRevenue || 0);

    if (!name.trim()) {
      setErr("Opportunity name is required.");
      setBusy(false);
      return;
    }

    if (estimated <= 0) {
      setErr("Estimated revenue must be greater than 0.");
      setBusy(false);
      return;
    }

    if (vertical === "athletics" && !selectedSchool?.id) {
      setErr("Select a school for Athletics.");
      setBusy(false);
      return;
    }

    if (vertical === "corporate" && !selectedAccount?.id) {
      setErr("Select an account for Corporate.");
      setBusy(false);
      return;
    }

    if (vertical === "corporate" && !selectedItem && !selectedFamily) {
      setErr("Select a corporate product family/item.");
      setBusy(false);
      return;
    }

    const res = await fetchWithAuth("/api/opportunities/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vertical,
        school_id: vertical === "athletics" ? selectedSchool?.id ?? null : null,
        account_id: vertical === "corporate" ? selectedAccount?.id ?? null : null,
        primary_contact_id: selectedContact?.id ?? null,
        assigned_to_user_id: canAssign ? assignedToUserId || null : null,
        name,
        description,
        sales_stage_key: salesStageKey,
        estimated_revenue: estimated,
        expected_close_date: expectedCloseDate || null,
        qualified_meeting_booked_at: qualifiedMeetingBookedAt || null,
        product_catalog_id: selectedItem ? selectedItem.id : null,
        product_family: selectedFamily || null,
        product_category: selectedCategory || null,
        product_subcategory: selectedSubcategory || null,
        product_name: selectedItem?.item_name || null,
        quantity:
          selectedItem?.requires_quantity && quantity !== ""
            ? Number(quantity || 0)
            : null,
        custom_product_name:
          selectedItem?.allows_custom_name || selectedFamily === "Other"
            ? customProductName || null
            : null,
        requires_approval: Boolean(selectedItem?.requires_approval),
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to create opportunity");
      setBusy(false);
      return;
    }

    setToast("Opportunity created");
    setBusy(false);

    if (json?.opportunity_id) {
      router.push(`/opportunities/${json.opportunity_id}`);
      return;
    }

    router.push("/opportunities");
  }

  return (
    <div className="space-y-8 p-6">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">{toast}</div>
        </div>
      ) : null}

      <div className="crm-card overflow-hidden p-0">
        <div className="border-b border-white/70 bg-gradient-to-r from-white/95 via-white/85 to-blue-50/80 px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                New Opportunity
              </h1>

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
                  {canAssign ? "Manager/admin assignment available" : "Self-assigned"}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                Create a new pipeline opportunity for Athletics or Corporate.
              </div>
            </div>

            <button
              className="crm-button px-4 py-2"
              onClick={() => router.push("/opportunities")}
            >
              Back
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="crm-card border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="crm-card p-6">
        <div className="text-lg font-semibold text-slate-900">Vertical</div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setVertical("athletics")}
            className={`rounded-xl border px-4 py-2 ${
              vertical === "athletics"
                ? "border-sky-200 bg-sky-50 font-semibold text-sky-700"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            Athletics
          </button>

          <button
            type="button"
            onClick={() => setVertical("corporate")}
            className={`rounded-xl border px-4 py-2 ${
              vertical === "corporate"
                ? "border-violet-200 bg-violet-50 font-semibold text-violet-700"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            Corporate
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="crm-card p-6 space-y-4">
            <div className="text-lg font-semibold text-slate-900">
              Core Opportunity Info
            </div>

            <input
              className="crm-input w-full px-3 py-2"
              placeholder="Opportunity name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <textarea
              className="crm-input min-h-[120px] w-full px-3 py-2"
              placeholder="Description / context"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <select
                className="crm-input px-3 py-2"
                value={salesStageKey}
                onChange={(e) => setSalesStageKey(e.target.value)}
              >
                <option value="prospecting">Prospecting (5%)</option>
                <option value="discovery">Discovery (25%)</option>
                <option value="presentation">Presentation (75%)</option>
                <option value="contract_signed">Contract Signed (100%)</option>
              </select>

              <input
                className="crm-input px-3 py-2"
                type="number"
                min="0"
                step="0.01"
                placeholder="Estimated revenue"
                value={estimatedRevenue}
                onChange={(e) => setEstimatedRevenue(e.target.value)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="crm-input px-3 py-2"
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
              />

              <input
                className="crm-input px-3 py-2"
                type="datetime-local"
                value={qualifiedMeetingBookedAt}
                onChange={(e) => setQualifiedMeetingBookedAt(e.target.value)}
              />
            </div>

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
              <div className="crm-card-soft px-3 py-2 text-sm text-slate-500">
                This opportunity will be assigned to you automatically.
              </div>
            )}
          </div>

          <div className="crm-card p-6 space-y-4">
            <div className="text-lg font-semibold text-slate-900">
              {vertical === "athletics" ? "School" : "Account"}
            </div>

            {vertical === "athletics" ? (
              <>
                {selectedSchool ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-sm text-slate-700">
                      <span className="font-medium">{selectedSchool.name}</span>
                      {selectedSchool.tier ? ` • Tier ${selectedSchool.tier}` : ""}
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
                      placeholder="Search school..."
                      value={schoolQuery}
                      onChange={(e) => setSchoolQuery(e.target.value)}
                    />

                    {schoolQuery.trim() ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {schoolLoading ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            Searching...
                          </div>
                        ) : schoolResults.length > 0 ? (
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
                                {school.tier ? `Tier ${school.tier}` : "No tier"}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            No schools found{exactSchoolMatch ? "" : "."}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <>
                {selectedAccount ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-sm text-slate-700">
                      <span className="font-medium">{selectedAccount.name}</span>
                      {selectedAccount.industry ? ` • ${selectedAccount.industry}` : ""}
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
                      placeholder="Search account..."
                      value={accountQuery}
                      onChange={(e) => setAccountQuery(e.target.value)}
                    />

                    {accountQuery.trim() ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {accountLoading ? (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            Searching...
                          </div>
                        ) : accountResults.length > 0 ? (
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
                                {[account.industry, account.company_size, account.hq_location]
                                  .filter(Boolean)
                                  .join(" • ") || "Account"}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            No accounts found{exactAccountMatch ? "" : "."}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>

          <div className="crm-card p-6 space-y-4">
            <div className="text-lg font-semibold text-slate-900">
              Primary Contact
            </div>

            {selectedContact ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-sm text-slate-700">
                  {fmtContact(selectedContact)}
                </div>
                <button
                  type="button"
                  className="text-xs text-slate-600 hover:text-slate-900"
                  onClick={() => {
                    setSelectedContact(null);
                    setContactQuery("");
                    setContactResults([]);
                  }}
                >
                  Clear
                </button>
              </div>
            ) : (
              <>
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder="Search contact..."
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                />

                {contactQuery.trim() ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {contactLoading ? (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        Searching...
                      </div>
                    ) : contactResults.length > 0 ? (
                      contactResults.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => {
                            setSelectedContact(contact);
                            setContactQuery("");
                            setContactResults([]);
                          }}
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <div className="text-sm font-medium text-slate-900">
                            {fmtContact(contact)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {contact.primary_email || "No email"}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No contacts found.
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {vertical === "corporate" ? (
            <div className="crm-card p-6 space-y-4">
              <div className="text-lg font-semibold text-slate-900">
                Corporate Product Tree
              </div>

              <select
                className="crm-input w-full px-3 py-2"
                value={selectedFamily}
                onChange={(e) => {
                  setSelectedFamily(e.target.value);
                  setSelectedCategory("");
                  setSelectedSubcategory("");
                  setSelectedItemId("");
                  setQuantity("");
                  setCustomProductName("");
                }}
              >
                <option value="">Select family</option>
                {families.map((family) => (
                  <option key={normalizeCatalogKey(family)} value={family}>
                    {family}
                  </option>
                ))}
              </select>

              {categories.length > 0 ? (
                <select
                  className="crm-input w-full px-3 py-2"
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setSelectedSubcategory("");
                    setSelectedItemId("");
                    setQuantity("");
                    setCustomProductName("");
                  }}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={normalizeCatalogKey(category)} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              ) : null}

              {subcategories.length > 0 ? (
                <select
                  className="crm-input w-full px-3 py-2"
                  value={selectedSubcategory}
                  onChange={(e) => {
                    setSelectedSubcategory(e.target.value);
                    setSelectedItemId("");
                    setQuantity("");
                    setCustomProductName("");
                  }}
                >
                  <option value="">Select subcategory</option>
                  {subcategories.map((subcategory) => (
                    <option
                      key={normalizeCatalogKey(subcategory)}
                      value={subcategory}
                    >
                      {subcategory}
                    </option>
                  ))}
                </select>
              ) : null}

              {itemOptions.length > 0 ? (
                <select
                  className="crm-input w-full px-3 py-2"
                  value={selectedItemId}
                  onChange={(e) => {
                    setSelectedItemId(e.target.value);
                    setQuantity("");
                    setCustomProductName("");
                  }}
                >
                  <option value="">Select item</option>
{itemOptions.map((item) => (
  <option
    key={[
      normalizeCatalogKey(item.family),
      normalizeCatalogKey(item.category),
      normalizeCatalogKey(item.subcategory),
      normalizeCatalogKey(item.item_name),
    ].join("|")}
    value={String(item.id)}
  >
    {cleanCatalogLabel(item.item_name)}
  </option>
))}
                </select>
              ) : null}

              {selectedItem?.requires_quantity ? (
                <input
                  className="crm-input w-full px-3 py-2"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              ) : null}

              {selectedItem?.allows_custom_name ? (
                <input
                  className="crm-input w-full px-3 py-2"
                  placeholder="Custom approved product name"
                  value={customProductName}
                  onChange={(e) => setCustomProductName(e.target.value)}
                />
              ) : null}

              {selectedItem?.requires_approval ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  This product requires approval.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="crm-card p-6">
              <div className="text-lg font-semibold text-slate-900">
                Athletics Opportunity Notes
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Athletics opportunities still use sales stages, forecasting, and
                estimated revenue, but do not require the corporate product tree.
              </div>
            </div>
          )}

          <div className="crm-card p-6">
            <div className="text-lg font-semibold text-slate-900">
              Forecast Preview
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="crm-card-soft p-4">
                <div className="text-xs text-slate-500">Stage</div>
                <div className="mt-2 font-semibold text-slate-900">
                  {salesStageKey === "prospecting"
                    ? "Prospecting (5%)"
                    : salesStageKey === "discovery"
                    ? "Discovery (25%)"
                    : salesStageKey === "presentation"
                    ? "Presentation (75%)"
                    : "Contract Signed (100%)"}
                </div>
              </div>

              <div className="crm-card-soft p-4">
                <div className="text-xs text-slate-500">Weighted Forecast</div>
                <div className="mt-2 font-semibold text-slate-900">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(
                    Number(estimatedRevenue || 0) *
                      (salesStageKey === "prospecting"
                        ? 0.05
                        : salesStageKey === "discovery"
                        ? 0.25
                        : salesStageKey === "presentation"
                        ? 0.75
                        : 1)
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="crm-button-primary px-5 py-3"
              disabled={busy}
              onClick={createOpportunity}
            >
              {busy ? "Creating..." : "Create Opportunity"}
            </button>

            <button
              className="crm-button px-5 py-3"
              onClick={() => router.push("/opportunities")}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}