"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-black/10 bg-white/60 shadow-[0_18px_50px_rgba(0,0,0,0.10)] backdrop-blur md:grid-cols-[1.15fr_0.85fr]">
          <div className="relative hidden min-h-[640px] bg-[#d85b09] md:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.10),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.08),transparent_35%)]" />
            <div className="relative flex h-full flex-col justify-between p-10">
              <div>
                <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium tracking-[0.18em] text-white/90">
                  PROTOS EQ CRM
                </div>
              </div>

              <div className="space-y-8">
                <div className="rounded-[2rem] bg-white/8 p-6 backdrop-blur-sm">
                  <div className="relative h-[140px] w-full">
                    <Image
                      src="/protos-eq-logo.png"
                      alt="Protos EQ"
                      fill
                      className="object-contain object-left"
                      priority
                    />
                  </div>
                </div>

                <div className="max-w-xl">
                  <h1 className="text-4xl font-semibold tracking-tight text-white">
                    Transforming teams from the inside out.
                  </h1>
                  <p className="mt-4 text-base leading-7 text-white/85">
                    Prospecting, cadences, follow-up execution, contact intelligence,
                    and opportunity workflow in one system.
                  </p>
                </div>
              </div>

              <div className="text-sm text-white/75">
                Behavioral intelligence-driven outreach platform
              </div>
            </div>
          </div>

          <div className="flex items-center bg-white/75 px-8 py-10 md:px-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 md:hidden">
                <div className="relative h-[88px] w-full">
                  <Image
                    src="/protos-eq-logo.png"
                    alt="Protos EQ"
                    fill
                    className="object-contain object-left"
                    priority
                  />
                </div>
              </div>

              <div className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
                Protos EQ CRM
              </div>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
                Login
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Sign in to access contacts, cadences, tasks, and execution workflow.
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="crm-input w-full px-5 py-4 text-lg"
                    placeholder="name@company.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="crm-input w-full px-5 py-4 text-lg"
                    placeholder="Enter password"
                  />
                </div>

                {msg ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {msg}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="crm-button-primary w-full px-5 py-4 text-lg disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Login"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}