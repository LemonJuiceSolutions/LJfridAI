-- GDPR Art. 7.1 — server-side proof of consent.
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentLog_userId_idx" ON "ConsentLog"("userId");
CREATE INDEX "ConsentLog_anonymousId_idx" ON "ConsentLog"("anonymousId");
CREATE INDEX "ConsentLog_createdAt_idx" ON "ConsentLog"("createdAt");
