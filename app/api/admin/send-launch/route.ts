import { NextResponse } from "next/server";
import { supabase, getAllSignups } from "@/lib/supabase";
import { sendLaunchEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;
const LAUNCH_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://greenlitmd.app";

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    // Only send to those not yet notified
    const { data: signups } = await supabase
      .from("waitlist_signups")
      .select("email")
      .eq("email_stage", 1);

    const emails = (signups ?? []).map((s: { email: string }) => s.email);

    if (emails.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "All subscribers already notified." });
    }

    let sent = 0;
    let failed = 0;
    const sentEmails: string[] = [];

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map((email) =>
          sendLaunchEmail(email, LAUNCH_URL).then(() => {
            sent += 1;
            sentEmails.push(email);
          }).catch(() => {
            failed += 1;
          })
        )
      );
      if (i + BATCH_SIZE < emails.length) await sleep(1200);
    }

    // Mark successfully emailed subscribers as stage 3
    if (sentEmails.length > 0) {
      await supabase
        .from("waitlist_signups")
        .update({ email_stage: 3 })
        .in("email", sentEmails);
    }

    return NextResponse.json({ success: true, sent, failed, total: emails.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
