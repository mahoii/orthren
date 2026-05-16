"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8 text-center">
        {success ? (
          <>
            <div className="mx-auto w-12 h-12 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mb-6">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-clinical-navy mb-3">Unsubscribed</h1>
            <p className="text-slate-600 mb-8 leading-relaxed">
              You have been successfully removed from the Greenlit MD waitlist. You won't receive any more emails from us.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-clinical-navy mb-3">Processing...</h1>
            <p className="text-slate-600 mb-8 leading-relaxed">Please wait while we process your request.</p>
          </>
        )}
        <Link
          href="/"
          className="text-sm font-semibold text-clinical-blue hover:text-clinical-navy transition-colors"
        >
          &larr; Back to Greenlit MD
        </Link>
      </div>
    </main>
  );
}
