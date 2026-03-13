// src/app/auth/callback/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // In most cases, Supabase sets the session automatically from the URL.
      // We just wait a beat and redirect.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) router.replace("/dashboard");
      else router.replace("/login");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-sm text-muted-foreground">Signing you in…</div>
    </div>
  );
}