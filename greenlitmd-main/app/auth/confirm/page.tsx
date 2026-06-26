'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useState, useEffect, Suspense } from 'react';

function ConfirmInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = (() => {
    const r = params.get('redirect');
    return r && r.startsWith('/') ? r : '/builder';
  })();

  // When the PKCE flow is used, createBrowserClient's detectSessionInUrl
  // auto-exchanges the ?code= param. Listen for that and redirect.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.push(redirectTo);
      }
    });
    return () => subscription.unsubscribe();
  }, [router, redirectTo]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);

    const code = params.get('code');
    const token_hash = params.get('token_hash');
    const type = params.get('type') as 'magiclink' | 'email' | null;

    const supabase = createSupabaseBrowserClient();

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
    } else {
      router.push(redirectTo);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-sm w-full text-center space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Sign in to Orthren</h1>
        <p className="text-sm text-gray-500">Click the button below to complete sign-in.</p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Signing in…' : 'Click to sign in'}
        </button>
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
