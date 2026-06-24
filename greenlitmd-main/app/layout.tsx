import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import Logo from "@/components/Logo";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Orthren",
  description: "AI-assisted prior authorization packet builder for orthopedic practices",
  icons: {
    icon: "/favicon-svg.svg",
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
    <html lang="en" className={dmSans.variable}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon-svg.svg" />
      </head>
      <body className="font-sans">
        <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-7xl items-center px-6" aria-label="Primary">
            <div className="flex flex-1 items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Logo size="md" />
                <span className="rounded-full border border-[#CBD5E1] bg-[#F8F9FB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Beta
                </span>
              </Link>
            </div>
            <div className="flex items-center">
              {isAuthenticated ? (
                <SignOutButton />
              ) : (
                <a
                  href="https://calendly.com/kamarishabazz/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-clinical-blue hover:shadow-md"
                >
                  Book a Free Demo
                </a>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
