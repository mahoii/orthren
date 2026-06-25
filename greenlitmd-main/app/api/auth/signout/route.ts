import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createSupabaseAuthServerClient();
  await supabase.auth.signOut();
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("signed_out", "true");
  return NextResponse.redirect(loginUrl);
}
