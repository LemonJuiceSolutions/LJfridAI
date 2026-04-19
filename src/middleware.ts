import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Edge-safe in-memory rate limiter ─────────────────────────────────────
// Edge runtime doesn't support the full Upstash fallback from @/lib/rate-limit.
// This is a conservative baseline limit per IP. Per-route limits with Upstash
// still run on the Node runtime inside each route handler.

type Bucket = { hits: number[] };
const globalForMw = globalThis as unknown as { _mwRlBuckets?: Map<string, Bucket> };
if (!globalForMw._mwRlBuckets) globalForMw._mwRlBuckets = new Map();
const buckets = globalForMw._mwRlBuckets;

const WINDOW_MS = 60_000;
const LIMIT_PER_IP = 300; // 300 req/min/IP — protects against aggressive scraping

function mwRateLimit(key: string): boolean {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    let b = buckets.get(key);
    if (!b) {
        b = { hits: [] };
        buckets.set(key, b);
    }
    b.hits = b.hits.filter(t => t > cutoff);
    if (b.hits.length >= LIMIT_PER_IP) return false;
    b.hits.push(now);
    return true;
}

function getIp(req: NextRequest): string {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'unknown';
}

// ─── Middleware ───────────────────────────────────────────────────────────
//
// Replaced next-auth/middleware's withAuth() because its default unauthorised
// behaviour is to 307-redirect every request to /api/auth/signin — including
// /api/* requests. Browser fetch() follows the redirect, lands on the signin
// HTML page, and `await res.json()` then throws SyntaxError ("string did not
// match the expected pattern") in components like sidebar-nav that poll
// JSON endpoints. We now branch:
//   - /api/* without a valid session → 401 JSON
//   - page route without a valid session → 307 redirect to signin
// Public routes are excluded via the matcher below.

export default async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;

    // Baseline /api/* rate limit (defense-in-depth; per-route limits still run
    // inside handlers and are more accurate because they key on user id).
    if (path.startsWith('/api/')) {
        const ip = getIp(req);
        if (!mwRateLimit(`mw:${ip}`)) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': '60' } },
            );
        }
    }

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
        if (path.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const signInUrl = new URL('/api/auth/signin', req.url);
        signInUrl.searchParams.set('callbackUrl', req.url);
        return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match everything except:
         * - api/auth (NextAuth internals)
         * - api/health (public health check)
         * - api/internal/query-db, api/internal/mcp-tool (shared-secret internal)
         * - api/update-commessa (handles its own auth + CORS)
         * - api/lead-generator/tool-call (webhook)
         * - api/whatsapp/webhook (Meta webhook)
         * - api/billing/webhook (Stripe webhook)
         * - api/cron/* (CRON_SECRET-gated)
         * - static assets and auth UI pages
         */
        "/((?!api/auth|api/health|api/internal/query-db|api/internal/mcp-tool|api/update-commessa|api/lead-generator/tool-call|api/whatsapp/webhook|api/billing/webhook|api/cron|_next/static|_next/image|favicon.ico|auth/signin|auth/signup|auth/reset|auth/new-password|logo-custom.png).*)",
    ],
};
