
import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Pin the file-tracing root to this project. Without this Next walks
  // upward, finds a stray /Users/<user>/package-lock.json and tries to trace
  // the entire home directory — which makes `next build` hang for 10+ minutes.
  outputFileTracingRoot: path.join(__dirname),
  /* config options here */
  typescript: {
    // Re-enabled 2026-04-17: 70 implicit-any errors swept, build passes.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Enforced: 0 errors in .eslintrc.json rule config. Warnings remain but
    // do not fail the build. React rules-of-hooks + unused-expressions are
    // tracked as warn pending a per-component audit.
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  serverExternalPackages: ['mssql', 'duckdb', 'duckdb-async'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    // Content-Security-Policy: defense-in-depth against stored-XSS in
    // chat/widgets. 'unsafe-inline' for styles is required by Tailwind
    // runtime + Radix; 'unsafe-eval' on scripts is required by Next dev/HMR
    // and some AI SDK code paths. Tighten further once those constraints
    // are removed (e.g. nonce-based or 'strict-dynamic').
    const isProd = process.env.NODE_ENV === 'production';

    // Dev needs ws:// for Turbopack HMR and http:// for the Python backend
    // on localhost:5005. Production keeps things tight.
    const connectSrc = isProd
      ? "'self' https: wss:"
      : "'self' https: http: ws: wss:";

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      `connect-src ${connectSrc}`,
      "frame-src 'self' blob:",
      "worker-src 'self' blob:",
      "media-src 'self' blob: data:",
      "manifest-src 'self'",
    ].join('; ');

    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // Dev: Report-Only so we don't break iframe widgets / sandbox edge
      // cases during development. Prod enforces the policy.
      {
        key: isProd ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
        value: csp,
      },
    ];
    if (isProd) {
      headers.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [{ source: '/(.*)', headers }];
  },
};

export default nextConfig;
