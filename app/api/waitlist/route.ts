import { NextResponse } from 'next/server';
import { insertSignup, getSignupPosition } from '@/lib/supabase/server';
import { sendConfirmationEmail } from '@/lib/resend';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, practice_name } = body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const { error: dbError } = await insertSignup(
      email,
      name || null,
      practice_name || null
    );

    if (dbError) {
      if (dbError.code === '23505') {
        return NextResponse.json({ error: 'You are already registered.' }, { status: 409 });
      }
      throw dbError;
    }

    const position = await getSignupPosition(email);

    // Trigger Resend Confirmation
    const { error: resendError } = await sendConfirmationEmail(email, position > 0 ? position : 1);
    
    if (resendError) {
      console.error("Resend Error (Confirmation Email):", resendError);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Waitlist API Error:", error);
    return NextResponse.json(
      { error: 'Failed to process. Please try again later.' }, 
      { status: 500 }
    );
  }
}