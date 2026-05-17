import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Initialize clients outside the handler to persist across warm invocations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS [cite: 136]
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    // 1. Insert into Supabase [cite: 155]
    const { error: dbError } = await supabase
      .from('waitlist')
      .insert([{ email }]);

    if (dbError) {
      // Handle the specific Postgres unique constraint violation [cite: 164]
      if (dbError.code === '23505') {
        return NextResponse.json({ error: 'You are already registered.' }, { status: 409 });
      }
      throw dbError;
    }

    // 2. Trigger Resend Confirmation
    const { error: emailError } = await resend.emails.send({
      from: 'Greenlit MD <waitlist@greenlitmd.app>',
      to: [email],
      subject: 'You are on the list',
      html: '<p>Thanks for joining the Greenlit MD waitlist. We will notify you when Phase 1 opens.</p>',
    });

    if (emailError) throw emailError;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Waitlist API Error:", error);
    return NextResponse.json(
      { error: 'Failed to process. Please try again later.' }, 
      { status: 500 }
    );
  }
}