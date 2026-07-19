// Derive the Supabase project origin (https + wss) from the env var at build
// time so the CSP stays correct if the Supabase project ever changes, rather
// than hardcoding a specific project ref.
function supabaseOrigins() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return { https: null, wss: null };
  try {
    const url = new URL(raw);
    return {
      https: `https://${url.host}`,
      wss: `wss://${url.host}`,
    };
  } catch {
    return { https: null, wss: null };
  }
}

// PostHog Cloud allows a configurable ingestion host (NEXT_PUBLIC_POSTHOG_HOST,
// e.g. https://us.i.posthog.com or the legacy https://app.posthog.com) and
// additionally lazy-loads its script bundle from a sibling "*-assets."
// subdomain of that host (e.g. us-assets.i.posthog.com). We allow-list the
// broader *.posthog.com family (report-only, so a slightly wider net here
// carries no breakage risk) rather than trying to derive the exact assets
// subdomain from an arbitrary configured host.
const posthogOrigins = ["https://*.posthog.com", "https://*.i.posthog.com"];

const { https: supabaseHttps, wss: supabaseWss } = supabaseOrigins();

function buildCsp() {
  const connectSrc = ["'self'", ...posthogOrigins];
  if (supabaseHttps) connectSrc.push(supabaseHttps);
  if (supabaseWss) connectSrc.push(supabaseWss);

  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...posthogOrigins],
    "connect-src": connectSrc,
    "img-src": ["'self'", "data:", "blob:"],
    // Tailwind + the documented inline-style exceptions (app/review/page.tsx,
    // components/AnnotatedLetter.tsx) require 'unsafe-inline' for style-src.
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "greenlitmd.app",
        "www.greenlitmd.app",
        "orthren.com",
        "www.orthren.com",
        "*.vercel.app" // Allows Vercel preview branch deployments to work
      ]
    }
  },
  // Content-Security-Policy-Report-Only added below (PostHog + Supabase
  // origins allow-listed, Supabase origin derived from
  // NEXT_PUBLIC_SUPABASE_URL at build time -- see buildCsp() above). This is
  // Report-Only, not enforcing: a deliberate staged rollout with zero
  // breakage risk. Promoting it to an enforcing Content-Security-Policy is a
  // separate, future step pending an observation window on the reports.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy-Report-Only", value: buildCsp() },
        ],
      },
    ];
  }
};

export default nextConfig;
