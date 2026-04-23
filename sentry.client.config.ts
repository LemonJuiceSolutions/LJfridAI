import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV ?? "development",

        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

        // Replay is opt-in — uncomment to capture session replays.
        // replaysSessionSampleRate: 0.1,
        // replaysOnErrorSampleRate: 1.0,
        // integrations: [Sentry.replayIntegration()],
    });
}
