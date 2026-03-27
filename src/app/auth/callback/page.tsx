"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function readHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const queryType = url.searchParams.get("type");
        const queryCode = url.searchParams.get("code");

        if (queryCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(queryCode);
          if (error) throw error;

          if (!cancelled) {
            router.replace("/dashboard");
          }
          return;
        }

        const hashParams = readHashParams();
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        const type = hashParams.get("type") || queryType;

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) throw error;

          if (!cancelled) {
            if (type === "invite" || type === "recovery") {
              router.replace("/onboarding/account");
            } else {
              router.replace("/dashboard");
            }
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) {
            router.replace("/dashboard");
          }
          return;
        }

        if (!cancelled) {
          setMessage("No active auth session found. Please use your invite link again.");
        }
      } catch (e: any) {
        if (!cancelled) {
          setMessage(e?.message || "Failed to complete authentication.");
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-6">
      <div className="w-full rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Auth Callback</h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}