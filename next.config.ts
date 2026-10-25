import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  // AGENTS.md was deleted on purpose; stop `next dev` from re-creating it.
  agentRules: false,
  // Keeps the Next.js badge out of demo screenshots.
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
