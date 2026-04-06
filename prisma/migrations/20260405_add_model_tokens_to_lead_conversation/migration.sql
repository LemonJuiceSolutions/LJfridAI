ALTER TABLE "LeadGeneratorConversation" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "LeadGeneratorConversation" ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER NOT NULL DEFAULT 0;
