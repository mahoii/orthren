import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/resend";
import { unsubscribeEmail } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://orthren.com";

  if (!token) {
    return NextResponse.redirect(`${appUrl}/unsubscribed`);
  }

  const email = verifyUnsubscribeToken(token);

  if (!email) {
    return NextResponse.redirect(`${appUrl}/unsubscribed`);
  }

  await unsubscribeEmail(email);

  return NextResponse.redirect(`${appUrl}/unsubscribed`);
}
