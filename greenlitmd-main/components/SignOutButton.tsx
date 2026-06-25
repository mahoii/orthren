"use client";

import { useEffect, useRef, useState } from "react";

const COUNTDOWN_SEC = 5;

function truncateEmail(email: string, max = 20): string {
  return email.length > max ? email.slice(0, max) + "…" : email;
}

export default function SignOutButton({ email }: { email: string | null }) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown() {
    setCountdown(COUNTDOWN_SEC);
  }

  function cancel() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setCountdown(null);
  }

  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      timerRef.current = null;
      fetch("/api/auth/signout", { method: "POST" }).then(() => {
        window.location.href = "/login";
      });
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [countdown]);

  return (
    <div className="flex items-center gap-3">
      {email && (
        <span className="hidden text-sm text-slate-500 sm:block" title={email}>
          {truncateEmail(email)}
        </span>
      )}

      {countdown !== null ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm">
          <span className="text-amber-700">
            Signing out in {countdown}s…
          </span>
          <button
            onClick={cancel}
            className="font-semibold text-amber-800 underline-offset-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={startCountdown}
          className="rounded-md border border-[#CBD5E1] px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
