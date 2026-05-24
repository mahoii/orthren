/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "greenlitmd.app",
        "www.greenlitmd.app",
        "*.vercel.app",
      ],
    },
  },
};

export default nextConfig;
