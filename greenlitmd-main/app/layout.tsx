import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Greenlit MD",
  description: "AI-assisted prior authorization packet builder for orthopedic practices"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
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
                  alt="Greenlit MD Logo"
                  width={32}
                  height={32}
                  priority
                  className="h-8 w-8 object-contain"
                />
                <span>Greenlit MD</span>
                <span className="rounded-full border border-[#CBD5E1] bg-[#F8F9FB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Beta
                </span>
              </Link>
            </div>
            <div className="flex items-center">
              <Link
                href="/waitlist"
                className="text-sm font-semibold text-clinical-blue hover:text-clinical-navy transition-colors"
              >
                Join Waitlist
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
