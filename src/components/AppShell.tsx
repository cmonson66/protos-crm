"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import Image from "next/image";

type MeResponse = {
  user_id: string;
  role: "admin" | "manager" | "rep";
  is_active: boolean;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    async function loadMe() {
      const res = await fetchWithAuth("/api/auth/me");
      const json = await res.json().catch(() => ({}));
      if (res.ok) setMe(json as MeResponse);
    }

    void loadMe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  const isPrivileged = me?.role === "admin" || me?.role === "manager";

  const nav = [
    { label: "Dashboard", href: "/dashboard", show: true },
    { label: "Work Queue", href: "/work", show: true },
    { label: "Execution Queue", href: "/work-queue", show: true },
    { label: "Contacts", href: "/contacts", show: true },
    { label: "Opportunities", href: "/opportunities", show: true },
    { label: "Tasks", href: "/tasks", show: true },
    { label: "Activity", href: "/activity", show: true },
    { label: "Leaderboard", href: "/leaderboard", show: true },
    { label: "Reps", href: "/reps", show: isPrivileged },
    { label: "School Account Health", href: "/admin/schools", show: isPrivileged },
    { label: "Template Admin", href: "/admin/communications/templates", show: isPrivileged },
    { label: "Template Sequence Builder", href: "/admin/communications/sequences", show: isPrivileged },
    { label: "Athletics Accounts", href: "/schools", show: isPrivileged },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
  <div className="relative h-12 w-[220px]">
    <Image
      src="/protos-eq-logo.png"
      alt="Protos EQ CRM"
      fill
      className="object-contain object-left"
      priority
    />
  </div>
</div>

          <button
            onClick={signOut}
            className="crm-button rounded-xl px-6 py-3 text-lg"
          >
            Sign out
          </button>
        </div>

        <div className="mt-6 grid grid-cols-[340px_1fr] gap-10">
          <aside className="rounded-[2rem] border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-[0_14px_34px_rgba(0,0,0,0.16)]">
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
                      "block rounded-2xl px-6 py-4 text-lg transition-all duration-150",
                      active
                        ? "border border-white/18 bg-white/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.12)]"
                        : "border border-white/8 bg-transparent text-white/92 hover:border-white/12 hover:bg-white/8 hover:text-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}