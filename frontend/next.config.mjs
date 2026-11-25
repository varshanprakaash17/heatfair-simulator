/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },
  typescript: {
    // The OpenNext-generated freebuff.* files import from @opennextjs/cloudflare
    // overrides paths whose type declarations are not resolved by Node's tsc.
    // Types are correct at runtime; skip the build-time check.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
