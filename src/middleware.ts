import { withAuth } from 'next-auth/middleware';
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

export default withAuth(
    function middleware(req) {
        const path = req.nextUrl.pathname;

        // Baseline /api/* rate limit (defense-in-depth; per-route limits still run
        // inside handlers and are more accurate because they key on user id).
        if (path.startsWith('/api/')) {
            const ip = getIp(req);
            if (!mwRateLimit(`mw:${ip}`)) {
                return new NextResponse(
                    JSON.stringify({ error: 'Too many requests' }),
                    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
                );
            }
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            // next-auth's default: authorized means "has a token". Public routes are
            // excluded by the matcher below, not here.
            authorized: ({ token }) => !!token,
        },
    },
);

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
