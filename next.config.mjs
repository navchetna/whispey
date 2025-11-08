import { createMDX } from 'fumadocs-mdx/next';
import path from 'path';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  reactStrictMode: true,
  
  // Disable telemetry
  telemetry: false,
  
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve('./src'),
    };
    return config;
  },
  
  compiler:{
    removeConsole: process.env.NODE_ENV === 'production'
  },
  
  // Environment variables for client side
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  
  // Configure image optimization for Docker
  images: {
    unoptimized: process.env.NODE_ENV === 'production',
  },
  
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*', 
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  
  skipTrailingSlashRedirect: true,
};

export default withMDX(config);