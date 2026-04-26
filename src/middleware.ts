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

// ─── CSP nonce generation ────────────────────────────────────────────────
// Generate a per-request nonce for script-src. This replaces 'unsafe-inline'
// and 'unsafe-eval' in production, neutralizing XSS via injected scripts.
// Next.js 15 automatically reads the nonce from the CSP header and injects
// it into its own inline scripts (hydration, chunks, etc.).

function generateNonce(): string {
    // crypto.randomUUID() is available in Edge runtime
    return Buffer.from(crypto.randomUUID()).toString('base64');
}

function buildCspHeader(nonce: string, isProd: boolean): string {
    // Dev needs ws:// for Turbopack HMR and http:// for the Python backend
    // on localhost:5005. Production keeps things tight.
    const connectSrc = isProd
        ? "'self' https: wss:"
        : "'self' https: http: ws: wss:";

    // In dev, keep 'unsafe-eval' for Next.js HMR / Turbopack and
    // 'unsafe-inline' as fallback so dev tools work without friction.
    // In prod, use nonce + strict-dynamic which is the gold standard.
    const scriptSrc = isProd
        ? `'self' 'nonce-${nonce}' 'strict-dynamic' blob:`
        : `'self' 'unsafe-inline' 'unsafe-eval' blob:`;

    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        // 'unsafe-inline' for styles is required by Tailwind runtime + Radix
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        `script-src ${scriptSrc}`,
        `connect-src ${connectSrc}`,
        "frame-src 'self' blob:",
        "worker-src 'self' blob:",
        "media-src 'self' blob: data:",
        "manifest-src 'self'",
    ].join('; ');
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

    // Admin/superadmin users without MFA complete a credentials login with
    // mfaPending=true only so they can reach the MFA setup flow. Do not let
    // that transitional session access the application or protected APIs.
    if ((token as any).mfaPending) {
        if (path.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'MFA setup required' },
                { status: 403 },
            );
        }
        const setupUrl = new URL('/auth/mfa-setup', req.url);
        return NextResponse.redirect(setupUrl);
    }

    // ── Nonce-based CSP ──────────────────────────────────────────────────
    const isProd = process.env.NODE_ENV === 'production';
    const nonce = generateNonce();
    const csp = buildCspHeader(nonce, isProd);

    // ── Correlation ID for request tracing ─────────────────────────────
    // Reuse an existing x-request-id from upstream proxies, otherwise mint one.
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    // Clone request headers and attach the nonce + correlation id so server
    // components can read them via headers().get('x-nonce') / 'x-request-id'.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('x-request-id', requestId);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });

    // Expose the correlation ID on the response so clients / load-balancers
    // can correlate logs end-to-end.
    response.headers.set('x-request-id', requestId);

    // Set CSP on the response. In dev use Report-Only so we don't break
    // iframe widgets / sandbox edge cases during development.
    response.headers.set(
        isProd ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
        csp,
    );

    return response;
}

export const config = {
    matcher: [
        /*
         * Match everything except:
         * - api/auth (NextAuth internals)
         * - api/health (public health check)
         * - api/internal/query-db, api/internal/mcp-tool (shared-secret internal)
         * - api/update-commessa (handles its own auth + CORS)
         * - api/whatsapp/webhook (Meta webhook)
         * - api/billing/webhook (Stripe webhook)
         * - api/cron/* (CRON_SECRET-gated)
         * - static assets and auth UI pages
         *
         * SECURITY M-07: api/lead-generator/tool-call removed from exclusions.
         * It uses session cookies (getServerSession) so the middleware auth +
         * rate-limit checks apply correctly. The route was previously excluded
         * under the assumption it was a webhook, but it is a session-auth'd
         * internal endpoint.
         */
        "/((?!api/auth|api/health|api/internal/query-db|api/internal/mcp-tool|api/update-commessa|api/whatsapp/webhook|api/billing/webhook|api/cron|_next/static|_next/image|favicon.ico|auth/signin|auth/signup|auth/reset|auth/new-password|auth/mfa-setup|logo-custom.png|mfa-setup-qr.png).*)",
    ],
};
