
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
    // Next 15 default 10MB request body cap on Route Handlers (and middleware).
    // Anteprima pipeline POSTs accumulated ancestor data (PRODFIL, PRODFIL2,
    // HR2, EstrazioneSharePoint) to /api/internal/execute-python — total JSON
    // can exceed 10MB → truncation → "Unexpected end of JSON input". 50mb
    // matches the Server Action limit below.
    middlewareClientMaxBodySize: '50mb',
    serverActions: {
      // Bumped to 50mb so Anteprima saves of nodes with large Plotly figs
      // (Gantt, multi-trace charts) can persist via updateTreeNodeAction
      // without hitting "Load failed" / RSC body cap. Flask responses are
      // gzipped so wire weight stays small even with 50mb cap.
      bodySizeLimit: '50mb',
    },
  },
  async headers() {
    // Security headers applied to all routes. CSP is handled dynamically in
    // middleware.ts using a per-request nonce (see C-03 hardening).
    const isProd = process.env.NODE_ENV === 'production';

    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
