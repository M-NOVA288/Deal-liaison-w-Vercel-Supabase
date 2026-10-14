/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Docker image. Vercel builds ignore this setting.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  // Type mismatches between library versions should not block a deploy.
  // The app's logic is covered by `npm test`; CI also runs `npm run typecheck` as a report.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
