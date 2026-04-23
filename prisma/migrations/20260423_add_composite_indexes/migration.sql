-- Add composite indexes for query performance (H-07)

-- Tree: dual-filter queries by companyId + type
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Tree_companyId_type_idx" ON "Tree" ("companyId", "type");

-- AgentConversation: "most recent" queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AgentConversation_companyId_updatedAt_idx" ON "AgentConversation" ("companyId", "updatedAt");

-- SuperAgentConversation: "most recent" queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SuperAgentConversation_companyId_updatedAt_idx" ON "SuperAgentConversation" ("companyId", "updatedAt");

-- ScheduledTaskExecution: dashboard queries by task + status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ScheduledTaskExecution_taskId_status_idx" ON "ScheduledTaskExecution" ("taskId", "status");

-- Lead: search filters by company + searchId
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Lead_companyId_searchId_idx" ON "Lead" ("companyId", "searchId");
