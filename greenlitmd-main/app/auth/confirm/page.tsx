'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSafeRelativeRedirect } from '@/lib/safe-redirect';
import { useState, useEffect, Suspense } from 'react';

function ConfirmInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = (() => {
    const r = params.get('redirect');
    return isSafeRelativeRedirect(r) ? r : '/builder';
  })();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const code = params.get('code');
    const token_hash = params.get('token_hash');
    const type = params.get('type') as 'magiclink' | 'email' | null;

    // Listen for auto-exchange (PKCE flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.push(redirectTo);
      }
    });

    // Manually exchange if params are present
    const exchange = async () => {
      setLoading(true);
      let err: { message: string } | null = null;
      if (code) {
        ({ error: err } = await supabase.auth.exchangeCodeForSession(code));
      } else if (token_hash && type) {
        ({ error: err } = await supabase.auth.verifyOtp({ token_hash, type }));
      } else {
        setError('Invalid sign-in link. Please request a new one.');
        setLoading(false);
        return;
      }
      if (err) {
        setError('Sign-in failed. Please request a new magic link.');
        setLoading(false);
      } else {
        router.push(redirectTo);
      }
    };

    exchange();
    return () => subscription.unsubscribe();
  }, [router, redirectTo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-sm w-full text-center space-y-4">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Sign-in failed</h1>
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            <a
              href="/login"
              className="inline-block text-sm text-indigo-600 hover:underline"
            >
              Request a new magic link
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Signing you in…</h1>
            <p className="text-sm text-gray-500">You&apos;ll be redirected automatically.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-sm w-full text-center">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    }>
      <ConfirmInner />
    </Suspense>
  );
}
