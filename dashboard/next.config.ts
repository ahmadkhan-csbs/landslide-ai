import type { NextConfig } from "next";

const renderApiUrl = process.env.NEXT_PUBLIC_API_URL || "https://landslide-ai.onrender.com";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["discolor-bankroll-starlight.ngrok-free.dev"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${renderApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
