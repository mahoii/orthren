import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orthren",
  description: "AI-assisted prior authorization packet builder for orthopedic practices",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  let isAuthenticated = false;
  try {
    const supabase = createSupabaseAuthServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    isAuthenticated = !!user;
  } catch {
    // cookies() unavailable in some static contexts — treat as unauthenticated
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-7xl items-center px-6" aria-label="Primary">
            <div className="flex flex-1 items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 text-base font-bold text-clinical-navy hover:text-clinical-blue transition-colors"
              >
                <Image
                  src="/logo.png"
                  alt="Orthren Logo"
                  width={32}
                  height={32}
                  priority
                  className="h-8 w-8 object-contain"
                />
                <span>Orthren</span>
                <span className="rounded-full border border-[#CBD5E1] bg-[#F8F9FB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Beta
                </span>
              </Link>
            </div>
            <div className="flex items-center">
              {isAuthenticated ? (
                <SignOutButton />
              ) : (
                <Link
                  href="/#waitlist-form"
                  className="rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-clinical-blue hover:shadow-md"
                >
                  Request Early Access
                </Link>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
