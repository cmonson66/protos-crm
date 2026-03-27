"use client";

import { supabase } from "@/lib/supabaseClient";

export async function fetchWithAuth(
  input: RequestInfo,
  init: RequestInit = {}
) {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }

  const accessToken = session?.access_token ?? null;

  const headers = new Headers(init.headers || {});

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (!headers.has("Content-Type") && init.body != null) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const retryToken = refreshed.data.session?.access_token ?? null;

    if (retryToken) {
      const retryHeaders = new Headers(init.headers || {});
      retryHeaders.set("Authorization", `Bearer ${retryToken}`);
      if (!retryHeaders.has("Content-Type") && init.body != null) {
        retryHeaders.set("Content-Type", "application/json");
      }

      return fetch(input, {
        ...init,
        headers: retryHeaders,
      });
    }
  }

  return res;
}