-- GDPR Art. 15/20: Add userId to conversation models for per-user data attribution.
-- All columns are nullable to support existing records (backfill separately).

-- AgentConversation
ALTER TABLE "AgentConversation" ADD COLUMN "userId" TEXT;
CREATE INDEX "AgentConversation_userId_idx" ON "AgentConversation"("userId");

-- SuperAgentConversation
ALTER TABLE "SuperAgentConversation" ADD COLUMN "userId" TEXT;
CREATE INDEX "SuperAgentConversation_userId_idx" ON "SuperAgentConversation"("userId");

-- LeadGeneratorConversation
ALTER TABLE "LeadGeneratorConversation" ADD COLUMN "userId" TEXT;
CREATE INDEX "LeadGeneratorConversation_userId_idx" ON "LeadGeneratorConversation"("userId");
