import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // In development, proxy /api/* to the local Node server (port 4000).
  // In production, the /api/* routes are handled by the Next.js app itself
  // (e.g. /api/config → the Node Express /api/config route, or environment
  // variables for the Python backend). No external proxy in production.
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:4000/api/:path*',
        },
      ];
    }
    return [];
  },
  // When running on Vercel, the app base path. Set via NEXT_PUBLIC_API_URL env var.
  // In dev this defaults to '/'; in production set https://your-app.vercel.app
  // (or leave empty for relative paths).
};

export default nextConfig;
