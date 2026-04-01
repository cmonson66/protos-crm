"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { EmailOtpType } from "@supabase/supabase-js";

function readHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function getNextPath(type: string | null) {
  if (type === "invite" || type === "recovery") {
    return "/onboarding/account";
  }
  return "/dashboard";
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
        const tokenHash = url.searchParams.get("token_hash");
        const next = getNextPath(queryType);

        // 1) PKCE/code flow
        if (queryCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(queryCode);
          if (error) throw error;

          if (!cancelled) {
            router.replace(next);
          }
          return;
        }

        // 2) token_hash flow (common for invite/recovery links)
        if (tokenHash && queryType) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: queryType as EmailOtpType,
          });

          if (error) throw error;

          if (!cancelled) {
            router.replace(next);
          }
          return;
        }

        // 3) Legacy/hash token flow
        const hashParams = readHashParams();
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const hashType = hashParams.get("type");
        const resolvedType = hashType || queryType;
        const resolvedNext = getNextPath(resolvedType);

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;

          if (!cancelled) {
            router.replace(resolvedNext);
          }
          return;
        }

        // 4) Existing session fallback
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (data.session) {
          if (!cancelled) {
            router.replace(next);
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