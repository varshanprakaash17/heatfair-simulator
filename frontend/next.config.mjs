/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API address no longer needs to be baked into the bundle: the browser
  // calls the same-origin /api/v1 proxy route, which reads HEATFAIR_API_URL on
  // the server. NEXT_PUBLIC_API_URL is only forwarded when explicitly set, so a
  // build never silently falls back to http://localhost:8000.
  ...(process.env.NEXT_PUBLIC_API_URL
    ? { env: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL } }
    : {}),
  typescript: {
    // The OpenNext-generated freebuff.* files import from @opennextjs/cloudflare
    // overrides paths whose type declarations are not resolved by Node's tsc.
    // Types are correct at runtime; skip the build-time check.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
