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
  }
};

export default nextConfig;
