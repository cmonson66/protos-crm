"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // If supabase picked up the recovery session, getSession will show it.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError(
          "No recovery session found. Please use the reset link from your email again."
        );
      }
      setChecking(false);
    })();
  }, []);

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== password2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setInfo("Password updated. Redirecting…");
    setTimeout(() => router.replace("/dashboard"), 700);
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Loading…
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border p-8 shadow bg-white">
        <h1 className="text-2xl font-semibold">Set new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a new password for your account.
        </p>

        <form onSubmit={setNewPassword} className="mt-6 space-y-4">
          <div>
            <label className="text-sm">New password</label>
            <input
              type="password"
              required
              className="w-full rounded-md border px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="text-sm">Confirm new password</label>
            <input
              type="password"
              required
              className="w-full rounded-md border px-3 py-2"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-800 px-4 py-2 text-white"
          >
            {loading ? "Saving..." : "Update password"}
          </button>
        </form>

        {info && <div className="mt-4 text-sm text-green-700">{info}</div>}
        {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      </div>
    </main>
  );
}