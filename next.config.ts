import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Убрали игнорирование ошибок. Теперь билд покажет, где есть проблемы.
  typescript: {
    // ignoreBuildErrors: false, // (по умолчанию false, строку можно просто удалить)
  },
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