import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint während des Builds ignorieren für Vercel-Deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
  // TypeScript-Fehler während des Builds ignorieren
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
