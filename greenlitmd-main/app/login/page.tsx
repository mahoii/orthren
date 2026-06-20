"use client";

import { useState } from "react";
import Logo from "@/components/Logo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
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
        emailRedirectTo: `${window.location.origin}/api/auth/callback`
      }
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[#F8F9FB] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" showWordmark={false} />
          <h1 className="text-2xl font-bold text-[#0F2A4A]">Sign in to Orthren</h1>
          <p className="text-sm text-slate-500">We&apos;ll send a magic link to your email.</p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-center shadow-sm">
            <p className="font-semibold text-[#0F2A4A]">Check your inbox</p>
            <p className="mt-1 text-sm text-slate-500">
              A sign-in link has been sent to <span className="font-medium text-slate-700">{email}</span>.
            </p>
          </div>
        ) : (
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
        )}
      </div>
    </main>
  );
}
