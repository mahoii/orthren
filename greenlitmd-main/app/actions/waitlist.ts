"use server";

import { insertSignup, getSignupPosition } from "@/lib/supabase/server";
import { sendConfirmationEmail } from "@/lib/resend";

export interface WaitlistActionResult {
  success: boolean;
  error?: string;
}

export async function joinWaitlistAction(
  formData: FormData
): Promise<WaitlistActionResult> {
  // Honeypot check — bots fill this, humans don't
  const honey = formData.get("honey");
  if (honey && String(honey).length > 0) {
    // Return success silently to not tip off the bot
    return { success: true };
  }

  const rawEmail = formData.get("email");
  const rawPractice = formData.get("practice_name");

  if (!rawEmail || typeof rawEmail !== "string") {
    return { success: false, error: "A valid email address is required." };
  }

  const email = rawEmail.trim().toLowerCase();
  const practice_name =
    rawPractice && typeof rawPractice === "string" && rawPractice.trim()
      ? rawPractice.trim()
      : null;

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { success: false, error: "Please enter a valid email address." };
  }

  try {
    const { error: dbError } = await insertSignup(email, null, practice_name);

    if (dbError) {
      // Postgres unique violation — duplicate email
      if (dbError.code === "23505") {
        return { success: false, error: "You're already on the list!" };
      }
      console.error("[joinWaitlistAction] DB insert error:", dbError);
      return {
        success: false,
        error: "Something went wrong. Please try again.",
      };
    }

    // Fire confirmation email — non-blocking; failure does not surface to user
    try {
      const position = await getSignupPosition(email);
      const resendResponse = await sendConfirmationEmail(email, position > 0 ? position : 1);
      
      // Explicitly check if Resend handed back a failure note
      if (resendResponse.error) {
        console.error("[joinWaitlistAction] Hidden Resend API Error:", resendResponse.error);
      } else {
        console.log("[joinWaitlistAction] Email successfully delivered:", resendResponse.data);
      }
    } catch (emailErr) {
      console.error("[joinWaitlistAction] Network crash error:", emailErr);
    }

    return { success: true };
  } catch (err) {
    console.error("[joinWaitlistAction] Unexpected error:", err);
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
