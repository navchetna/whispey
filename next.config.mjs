import { createMDX } from 'fumadocs-mdx/next';
import path from 'path';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  reactStrictMode: true,
  
  // Completely disable static optimization to prevent build errors
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  
  // Force all pages to be dynamic
  dynamicIO: false,
  
  // Skip prerendering during build
  skipTrailingSlashRedirect: true,
  
  // Custom webpack config
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve('./src'),
    };
    // Disable static page generation errors
    if (isServer) {
      config.optimization.minimize = false;
    }
    return config;
  },
  
  compiler:{
    // Only remove console logs if DEBUG is not set
    removeConsole: process.env.NODE_ENV === 'production' && !process.env.DEBUG
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
};

export default withMDX(config);