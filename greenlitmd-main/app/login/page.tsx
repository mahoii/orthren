"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function AuthErrorBanner() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth_failed";
  const [dismissed, setDismissed] = useState(false);

  if (!authError || dismissed) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="flex-1">Login link expired or invalid. Request a new one.</span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 font-medium hover:text-red-900"
        aria-label="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-center shadow-sm">
        <p className="font-semibold text-[#0F2A4A]">Check your inbox</p>
        <p className="mt-1 text-sm text-slate-500">
          A sign-in link has been sent to <span className="font-medium text-slate-700">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
      <label className="block text-sm font-medium text-slate-700" htmlFor="email">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@practice.com"
        className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-[#0F2A4A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2563EB] disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[#F8F9FB] px-4">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <AuthErrorBanner />
        </Suspense>
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" showWordmark={false} />
          <h1 className="text-2xl font-bold text-[#0F2A4A]">Sign in to Orthren</h1>
          <p className="text-sm text-slate-500">We&apos;ll send a magic link to your email.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
