// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos', pathname: '/**' }],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [{
        loader: '@svgr/webpack',
        options: {
          titleProp: true,
          dimensions: false,              
          svgo: true,
          svgoConfig: {
            plugins: [
              { name: 'preset-default', params: { overrides: { removeViewBox: false } } },
            ],
          },
        },
      }],
    });
    return config;
  },
};

export default nextConfig;