/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  output: 'standalone',
  transpilePackages: ['@veda/shared-types'],
};

export default nextConfig;
