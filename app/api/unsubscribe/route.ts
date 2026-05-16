import { NextResponse } from "next/server";
import { verifyUnsubscribeToken, createUnsubscribeToken } from "@/lib/resend";
import { deleteSignupByEmail } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const email = verifyUnsubscribeToken(token);

  if (!email) {
    return NextResponse.json({ error: "Invalid or expired unsubscribe link." }, { status: 400 });
  }

  await deleteSignupByEmail(email);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://greenlitmd.app";
  return NextResponse.redirect(`${appUrl}/unsubscribe?success=1`);
}
