// src/app/reset-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function updatePassword() {
    setMsg(null);

    if (pw1.length < 8) return setMsg("Password must be at least 8 characters.");
    if (pw1 !== pw2) return setMsg("Passwords do not match.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);

    if (error) return setMsg(error.message);

    router.replace("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set new password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm">New password</div>
            <Input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-sm">Confirm password</div>
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>

          {msg && <div className="text-sm text-muted-foreground">{msg}</div>}

          <Button onClick={updatePassword} disabled={busy || !pw1 || !pw2} className="w-full">
            {busy ? "Saving..." : "Update password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}