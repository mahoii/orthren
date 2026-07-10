import { NextResponse } from "next/server";
import { getAllSignups } from "@/lib/supabase/server";
import { sendUpdateEmail } from "@/lib/resend";
import { adminRateLimiter } from "@/lib/rate-limit";
import { isValidAdminSecret } from "@/lib/admin-auth";
import crypto from "crypto";

function hashEmail(email: string) {
  return crypto.createHash("sha256").update(email).digest("hex").slice(0, 12);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const { success } = await adminRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (!isValidAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      subject?: string;
      headline?: string;
      bullets?: string[];
      screenshot_url?: string;
    };

    if (!body.subject || !body.headline || !Array.isArray(body.bullets) || body.bullets.length === 0) {
      return NextResponse.json(
        { error: "subject, headline, and bullets (array) are required." },
        { status: 400 }
      );
    }

    const signups = await getAllSignups();
    const emails = signups.map((s) => s.email);

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map((email) =>
          sendUpdateEmail(email, {
            subject: body.subject!,
            headline: body.headline!,
            bullets: body.bullets!,
            screenshot_url: body.screenshot_url
          }).then((res) => {
            if (res.error) {
              console.error(`Resend failed for [${hashEmail(email)}]:`, res.error);
              failed += 1;
            } else {
              sent += 1;
            }
          }).catch((err) => {
            console.error(`Unexpected error sending to [${hashEmail(email)}]:`, err);
            failed += 1;
          })
        )
      );
      // Small delay between batches to stay within Resend rate limits
      if (i + BATCH_SIZE < emails.length) await sleep(1200);
    }

    return NextResponse.json({ success: true, sent, failed, total: emails.length });
  } catch (err) {
    console.error("[admin/send-update] POST handler error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
