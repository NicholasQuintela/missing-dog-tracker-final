/** @type {import('next').NextConfig} */
const nextConfig = {
  // v6.4: enable Next.js 16 Cache Components / Vercel Runtime Cache.
  cacheComponents: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
