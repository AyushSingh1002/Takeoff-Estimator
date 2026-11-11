import type { NextConfig } from 'next';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    // Keep browser calls same-origin so the HttpOnly session cookie is scoped
    // to the web origin and no CORS/credentials special cases are needed.
    return [{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }];
  },
};

export default nextConfig;
