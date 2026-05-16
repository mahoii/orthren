import { NextResponse } from "next/server";
import { insertSignup, getSignupPosition } from "@/lib/supabase/server";
import { createResendClient, sendConfirmationEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-memory rate limiter: 3 requests per IP per hour
const ipRateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    ipRateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    // IP rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      phone?: string;
      practice_name?: string;
      _honey?: string;
    };

    // Honeypot: if filled, silently succeed (bot)
    if (body._honey) {
      return NextResponse.json({ success: true, position: 1 });
    }

    // Email validation
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }

    const phone = body.phone?.trim() || null;
    const practiceName = body.practice_name?.trim() || null;

    // Insert into Supabase
    const { data, error } = await insertSignup(email, phone, practiceName);

    if (error) {
      // Supabase unique violation code is 23505
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        return NextResponse.json(
          { error: "This email is already on the waitlist." },
          { status: 409 }
        );
      }
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Unable to join the waitlist. Please try again." }, { status: 500 });
    }

    const position = await getSignupPosition(email);
    const resend = createResendClient();

    // Fire confirmation email (non-blocking — don't fail the request if email fails)
    sendConfirmationEmail(email, position, resend).catch((err) =>
      console.error("Resend confirmation email failed:", err)
    );

    return NextResponse.json({ success: true, position });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
