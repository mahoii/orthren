import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/resend";
import { unsubscribeEmail } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST-only: a bare GET (e.g. an email-scanner prefetch of the emailed link)
// must never trigger the unsubscribe side effect. The emailed link now points
// at /unsubscribe (a confirmation page) instead of this route directly; that
// page's explicit button click is what fires this POST. See E3 in
// AUDIT-FINDINGS.md.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token;

  if (!token) {
    return NextResponse.json({ error: "Missing unsubscribe token." }, { status: 400 });
  }

  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link." }, { status: 400 });
  }

  const { success } = await unsubscribeEmail(email);
  if (!success) {
    return NextResponse.json({ error: "Unable to process unsubscribe request. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
