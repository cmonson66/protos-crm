"use client";

import AuthGate from "@/components/AuthGate";
import AppShell from "@/components/AppShell";

export default function AppLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}