import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("signed_out", "true");

  try {
    const supabase = createSupabaseAuthServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[auth/signout] signOut error:", error);
  }

  return NextResponse.redirect(loginUrl);
}
