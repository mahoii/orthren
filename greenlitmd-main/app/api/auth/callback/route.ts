import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const redirectParam = searchParams.get('redirect')
  const next = (redirectParam && redirectParam.startsWith('/'))
    ? redirectParam
    : (searchParams.get('next') ?? '/builder')

  // Build the success redirect first so we can attach cookies directly to it.
  // Using cookies() from next/headers here would set cookies on a different
  // response object than the NextResponse.redirect we return, so the session
  // cookies would not be sent to the browser with the redirect.
  const successUrl = `${origin}${next}`
  const errorUrl = `${origin}/login?error=auth_failed`
  const response = NextResponse.redirect(successUrl)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (pairs) =>
          pairs.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  )

  let error: string | null = null

  if (token_hash && type) {
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash, type })
    if (otpError) error = otpError.message
  } else if (code) {
    const { error: codeError } = await supabase.auth.exchangeCodeForSession(code)
    if (codeError) error = codeError.message
  } else {
    error = 'No auth params found'
  }

  if (error) {
    console.error('[auth/callback] error:', error)
    return NextResponse.redirect(errorUrl)
  }

  return response
}
