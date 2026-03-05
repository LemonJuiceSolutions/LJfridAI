-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "chartTheme" JSONB,
ADD COLUMN     "htmlStylePresets" JSONB,
ADD COLUMN     "leadGenApiKeys" JSONB;

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "tableSchema" JSONB,
    "inputTables" JSONB,
    "messages" JSONB NOT NULL,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBaseEntry" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "context" TEXT,
    "tags" TEXT[],
    "category" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAgentConversation" (
    "id" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "scheduleType" TEXT NOT NULL DEFAULT 'interval',
    "cronExpression" TEXT,
    "intervalMinutes" INTEGER,
    "daysOfWeek" TEXT,
    "hours" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "retryDelayMinutes" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "companyId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskExecution" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTaskExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSearch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "emailStatus" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "companyName" TEXT,
    "companyDomain" TEXT,
    "companyWebsite" TEXT,
    "companySize" TEXT,
    "companyIndustry" TEXT,
    "companyCity" TEXT,
    "companyCountry" TEXT,
    "companyLinkedin" TEXT,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "rawData" JSONB,
    "notes" TEXT,
    "rating" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revenueYear1" TEXT,
    "revenueYear2" TEXT,
    "revenueYear3" TEXT,
    "profitYear1" TEXT,
    "profitYear2" TEXT,
    "profitYear3" TEXT,
    "searchId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadGeneratorConversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "messages" JSONB NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadGeneratorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentConversation_nodeId_idx" ON "AgentConversation"("nodeId");

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_idx" ON "AgentConversation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConversation_nodeId_agentType_key" ON "AgentConversation"("nodeId", "agentType");

-- CreateIndex
CREATE INDEX "KnowledgeBaseEntry_companyId_idx" ON "KnowledgeBaseEntry"("companyId");

-- CreateIndex
CREATE INDEX "SuperAgentConversation_companyId_idx" ON "SuperAgentConversation"("companyId");

-- CreateIndex
CREATE INDEX "ScheduledTask_companyId_idx" ON "ScheduledTask"("companyId");

-- CreateIndex
CREATE INDEX "ScheduledTask_status_idx" ON "ScheduledTask"("status");

-- CreateIndex
CREATE INDEX "ScheduledTask_nextRunAt_idx" ON "ScheduledTask"("nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduledTask_type_idx" ON "ScheduledTask"("type");

-- CreateIndex
CREATE INDEX "ScheduledTaskExecution_taskId_idx" ON "ScheduledTaskExecution"("taskId");

-- CreateIndex
CREATE INDEX "ScheduledTaskExecution_status_idx" ON "ScheduledTaskExecution"("status");

-- CreateIndex
CREATE INDEX "ScheduledTaskExecution_startedAt_idx" ON "ScheduledTaskExecution"("startedAt");

-- CreateIndex
CREATE INDEX "LeadSearch_companyId_idx" ON "LeadSearch"("companyId");

-- CreateIndex
CREATE INDEX "LeadSearch_status_idx" ON "LeadSearch"("status");

-- CreateIndex
CREATE INDEX "LeadSearch_conversationId_idx" ON "LeadSearch"("conversationId");

-- CreateIndex
CREATE INDEX "Lead_companyId_idx" ON "Lead"("companyId");

-- CreateIndex
CREATE INDEX "Lead_searchId_idx" ON "Lead"("searchId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_companyName_idx" ON "Lead"("companyName");

-- CreateIndex
CREATE INDEX "LeadGeneratorConversation_companyId_idx" ON "LeadGeneratorConversation"("companyId");

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBaseEntry" ADD CONSTRAINT "KnowledgeBaseEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperAgentConversation" ADD CONSTRAINT "SuperAgentConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskExecution" ADD CONSTRAINT "ScheduledTaskExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearch" ADD CONSTRAINT "LeadSearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSearch" ADD CONSTRAINT "LeadSearch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LeadGeneratorConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LeadSearch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadGeneratorConversation" ADD CONSTRAINT "LeadGeneratorConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
