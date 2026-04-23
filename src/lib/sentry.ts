import * as Sentry from "@sentry/nextjs";

/**
 * Initialize Sentry for server-side error tracking.
 * Called from instrumentation.ts during Node.js runtime registration.
 */
export function initSentry() {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
        console.warn("[sentry] NEXT_PUBLIC_SENTRY_DSN not set — Sentry disabled.");
        return;
    }

    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV ?? "development",

        // Capture 100% of errors, sample 10% of traces in production.
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

        // Disable Sentry in development unless DSN is explicitly set.
        enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    });
}
