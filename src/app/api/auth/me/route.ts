import { NextResponse } from "next/server";
import { getRole, requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const me = auth.user.id;
  const { role, is_active } = await getRole(me);

  return NextResponse.json({
    user_id: me,
    role,
    is_active,
  });
}