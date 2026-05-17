import { NextResponse } from "next/server";
import { getAllSignups } from "@/lib/supabase/server";
import { sendLaunchEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const signups = await getAllSignups();
    const APP_URL = "https://greenlitmd.app";

    let emailSent = 0;
    let emailFailed = 0;

    for (let i = 0; i < signups.length; i += BATCH_SIZE) {
      const batch = signups.slice(i, i + BATCH_SIZE);
      
      await Promise.allSettled(
        batch.map(async (signup) => {
          // Send Launch Email
          try {
            await sendLaunchEmail(signup.email, APP_URL);
            emailSent += 1;
          } catch (e) {
            emailFailed += 1;
          }
        })
      );
      // Small delay between batches to stay within rate limits
      if (i + BATCH_SIZE < signups.length) await sleep(1200);
    }

    return NextResponse.json({ 
      success: true, 
      emailSent, 
      emailFailed, 
      total: signups.length 
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
