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
  // No CSP yet -- this product holds PHI in browser sessionStorage with no
  // security headers at all (see E7 in AUDIT-FINDINGS.md). A CSP needs care
  // (PostHog + Supabase origins must be allow-listed) and is left for a
  // dedicated pass; these four are safe, uncontroversial defaults that don't
  // risk breaking any existing integration.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  }
};

export default nextConfig;
