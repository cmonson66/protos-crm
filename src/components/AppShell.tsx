"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

type MeResponse = {
  user_id: string;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      const res = await fetchWithAuth("/api/auth/me");
      const json = await res.json().catch(() => ({}));

      if (!mounted) return;

      if (res.ok) {
        setMe(json as MeResponse);
      } else {
        setMe(null);
      }
    }

    void loadMe();

    return () => {
      mounted = false;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  const isPrivileged = me?.role === "admin" || me?.role === "manager";

  const nav = useMemo(() => {
    const items = [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Work Queue", href: "/work" },
      { label: "Execution Queue", href: "/work-queue" },
      { label: "Contacts", href: "/contacts" },
      { label: "Accounts", href: "/accounts" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Tasks", href: "/tasks" },
      { label: "Activity", href: "/activity" },
    ];

    if (isPrivileged) {
      items.push(
        { label: "Leaderboard Admin", href: "/admin/leaderboard" },
        { label: "School Accounts", href: "/schools" },
        { label: "Reps", href: "/reps" },
        { label: "School Health", href: "/admin/schools" },
        { label: "Admin Cadences", href: "/admin/cadences" },
        { label: "Cadence Health", href: "/admin/cadence-health" }
      );
    }

    return items;
  }, [isPrivileged]);

  return (
    <div className="min-h-screen p-8">
      <div className="flex items-start justify-between">
        <div className="text-sm text-muted-foreground">Protos EQ CRM</div>

        <button
          onClick={signOut}
          className="rounded-xl border px-6 py-3 text-lg"
        >
          Sign out
        </button>
      </div>

      <div className="mt-6 grid grid-cols-[320px_1fr] gap-10">
        <aside>
          <div className="space-y-4">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(item.href + "/"));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "block rounded-2xl border px-6 py-4 text-lg",
                    active ? "bg-slate-100" : "bg-white",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}