/** @type {import('next').NextConfig} */
const nextConfig = {
  serverActions: {
    allowedOrigins: [
      "greenlitmd.app",
      "www.greenlitmd.app",
      "*.vercel.app" // Allows Vercel preview branch deployments to work
    ]
  }
};

export default nextConfig;
