"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OnboardingProfileResponse = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
  phone: string | null;
  job_title: string | null;
  region: string | null;
  timezone: string | null;
  onboarding_completed_at: string | null;
  onboarding_notes: string | null;
  manager_user_id: string | null;
};

const TIMEZONE_OPTIONS = [
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
];

export default function OnboardingAccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [region, setRegion] = useState("");
  const [timezone, setTimezone] = useState("America/Phoenix");
  const [notes, setNotes] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordValid = useMemo(() => password.trim().length >= 8, [password]);
  const passwordsMatch = useMemo(() => password === confirmPassword, [password, confirmPassword]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (!sessionData.session) {
          router.replace("/login");
          return;
        }

        const res = await fetch("/api/onboarding/profile", {
          method: "GET",
          headers: {
            authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || "Failed to load onboarding profile");
        }

        const profile = json as OnboardingProfileResponse;

        if (!cancelled) {
          setEmail(profile.email || sessionData.session.user.email || "");
          setFullName(profile.full_name || "");
          setPhone(profile.phone || "");
          setJobTitle(profile.job_title || "");
          setRegion(profile.region || "");
          setTimezone(profile.timezone || "America/Phoenix");
          setNotes(profile.onboarding_notes || "");
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || "Failed to load onboarding.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit() {
    setErr(null);

    if (!fullName.trim()) {
      setErr("Full name is required.");
      return;
    }

    if (!passwordValid) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    if (!passwordsMatch) {
      setErr("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      if (!sessionData.session) throw new Error("No active session.");

      const { error: authErr } = await supabase.auth.updateUser({
        password,
        data: {
          full_name: fullName.trim(),
        },
      });

      if (authErr) throw authErr;

      const res = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone,
          job_title: jobTitle,
          region,
          timezone,
          onboarding_notes: notes,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save onboarding profile");
      }

      await supabase.auth.signOut();

      router.replace("/login?setup=complete");
    } catch (e: any) {
      setErr(e?.message || "Failed to complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-6">
        <div className="w-full rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Set Up Account</h1>
          <p className="mt-3 text-sm text-slate-600">Loading your invite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-6 py-10">
      <div className="w-full rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Complete Your Account Setup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set your password and finish your profile to access Protos CRM.
        </p>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              value={email}
              disabled
              className="w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="Phone number"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Job title</label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="Sales Manager, Rep, Director..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Region</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="Southwest, West, National..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="Re-enter password"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[110px] w-full rounded-xl border px-4 py-3 text-sm"
              placeholder="Optional onboarding notes"
            />
          </div>
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="mt-6 w-full rounded-xl border bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Complete Setup"}
        </button>
      </div>
    </div>
  );
}