// src/lib/fetchWithAuth.ts
"use client";

import { supabase } from "@/lib/supabaseClient";

export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const access_token = data.session?.access_token;

  const headers = new Headers(init.headers || {});
  if (access_token) headers.set("Authorization", `Bearer ${access_token}`);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");

  return fetch(input, { ...init, headers });
}