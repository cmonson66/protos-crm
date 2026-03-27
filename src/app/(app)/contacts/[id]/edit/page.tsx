"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  job_title_raw: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  sport: string;
  division: string | null;
  conference: string | null;
  region: string | null;
  status: string;
  active: boolean;
  assigned_to_user_id: string | null;
  rep_notes: string | null;
};

type RepRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

const STATUS_OPTIONS = ["New", "Secured/Active", "Closed/Do Not Contact"] as const;

export default function EditContactPage() {
  const params = useParams<{ id: string }>();
  const contactId = params?.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [contact, setContact] = useState<Contact | null>(null);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [canAssign, setCanAssign] = useState(false);

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
  const [sport, setSport] = useState("");
  const [division, setDivision] = useState("");
  const [conference, setConference] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<string>("New");
  const [active, setActive] = useState(true);
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [repNotes, setRepNotes] = useState("");

  useEffect(() => {
    async function loadAll() {
      if (!contactId) return;

      setLoading(true);
      setErr(null);

      const repsRes = await fetchWithAuth("/api/reps/list");
      const repsJson = await repsRes.json().catch(() => ({}));

      if (repsRes.ok) {
        setReps((repsJson.data ?? []) as RepRow[]);
        setCanAssign(true);
      } else {
        setReps([]);
        setCanAssign(false);
      }

      const { data, error } = await supabase
        .from("contacts")
        .select(`
          id,
          first_name,
          last_name,
          primary_email,
          job_title_raw,
          phone,
          address,
          city,
          state,
          zip,
          website,
          sport,
          division,
          conference,
          region,
          status,
          active,
          assigned_to_user_id,
          rep_notes
        `)
        .eq("id", contactId)
        .maybeSingle();

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setErr("Contact not found.");
        setLoading(false);
        return;
      }

      const c = data as Contact;
      setContact(c);

      setFirstName(c.first_name ?? "");
      setLastName(c.last_name ?? "");
      setEmail(c.primary_email ?? "");
      setJobTitle(c.job_title_raw ?? "");
      setPhone(c.phone ?? "");
      setAddress(c.address ?? "");
      setCity(c.city ?? "");
      setStateValue(c.state ?? "");
      setZip(c.zip ?? "");
      setWebsite(c.website ?? "");
      setSport(c.sport ?? "");
      setDivision(c.division ?? "");
      setConference(c.conference ?? "");
      setRegion(c.region ?? "");
      setStatus(c.status ?? "New");
      setActive(Boolean(c.active));
      setAssignedToUserId(c.assigned_to_user_id ?? "");
      setRepNotes(c.rep_notes ?? "");

      setLoading(false);
    }

    void loadAll();
  }, [contactId]);

  async function save() {
    if (!contactId) return;

    setBusy(true);
    setErr(null);

    const res = await fetchWithAuth("/api/contacts/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
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
        sport,
        division,
        conference,
        region,
        status,
        rep_notes: repNotes,
        ...(canAssign
          ? {
              assigned_to_user_id: assignedToUserId || null,
              active,
            }
          : {}),
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to update contact");
      setBusy(false);
      return;
    }

    setBusy(false);
    router.push(`/contacts/${contactId}`);
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading contact…</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-3xl font-semibold">Edit Contact</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Update contact identity, pipeline, and assignment fields.
          </div>
        </div>

        <button
          className="rounded-xl border px-4 py-2"
          onClick={() => router.push(`/contacts/${contactId}`)}
        >
          Back
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border p-5 space-y-4">
          <div className="text-lg font-semibold">Identity</div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Job title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />

          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Street address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="State"
              value={stateValue}
              onChange={(e) => setStateValue(e.target.value)}
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="Zip"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>

          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="rounded-2xl border p-5 space-y-4">
          <div className="text-lg font-semibold">Program / Pipeline</div>

          <input
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Sport"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
          />

          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="Division"
              value={division}
              onChange={(e) => setDivision(e.target.value)}
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="Conference"
              value={conference}
              onChange={(e) => setConference(e.target.value)}
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>

          <select
            className="w-full rounded-xl border px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {canAssign ? (
            <>
              <select
                className="w-full rounded-xl border px-3 py-2"
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

              <label className="flex items-center gap-3 rounded-xl border px-3 py-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <span className="text-sm">Active</span>
              </label>
            </>
          ) : null}

          <textarea
            className="min-h-[140px] w-full rounded-xl border px-3 py-2"
            placeholder="Rep notes"
            value={repNotes}
            onChange={(e) => setRepNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="rounded-xl border px-5 py-3" disabled={busy} onClick={save}>
          {busy ? "Saving..." : "Save Changes"}
        </button>

        <button
          className="rounded-xl border px-5 py-3"
          onClick={() => router.push(`/contacts/${contactId}`)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}