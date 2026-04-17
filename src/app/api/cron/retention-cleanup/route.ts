import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { timingSafeEqual } from 'crypto';

// GDPR retention windows — minimize per data minimization principle (Art. 5.1.e)
const RETENTION = {
    auditLog: 365,                  // 12 months — security/audit logs
    scheduledTaskExecution: 365,    // 12 months — task history
    triggerLog: 365,                // 12 months
    agentConversation: 90,          // 90 days — may embed PII from prompts
    superAgentConversation: 90,     // 90 days — same
    leadGeneratorConversation: 90,  // 90 days
    nodePreviewCache: 30,           // 30 days — cached preview data
};

function safeEqual(a: string, b: string): boolean {
    try {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) return false;
        return timingSafeEqual(ab, bb);
    } catch { return false; }
}

export async function POST(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json(
            { error: 'CRON_SECRET environment variable is not configured' },
            { status: 500 }
        );
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('CRON_SECRET') ?? '';
    if (!safeEqual(authHeader, cronSecret) && !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    const cutoff = (days: number) => new Date(now - days * 86400_000);

    try {
        // Use Promise.allSettled so one missing table does not abort the whole job.
        // Each model is wrapped in try/catch via .catch(() => null).
        type DeleteResult = { count: number } | null;
        const safe = (p: Promise<any> | undefined): Promise<DeleteResult> =>
            p ? p.catch((e: any) => { console.warn('[retention-cleanup]', e?.message); return null; }) : Promise.resolve(null);

        const [
            executions, triggerLogs, agentConv, auditLogs,
            superAgentConv, leadGenConv, previewCache,
            sessions, verificationTokens, passwordResetTokens,
        ] = await Promise.all([
            safe(db.scheduledTaskExecution.deleteMany({ where: { startedAt: { lt: cutoff(RETENTION.scheduledTaskExecution) } } })),
            safe(db.triggerLog.deleteMany({ where: { createdAt: { lt: cutoff(RETENTION.triggerLog) } } })),
            safe(db.agentConversation.deleteMany({ where: { updatedAt: { lt: cutoff(RETENTION.agentConversation) } } })),
            safe((db as any).auditLog?.deleteMany({ where: { createdAt: { lt: cutoff(RETENTION.auditLog) } } })),
            safe((db as any).superAgentConversation?.deleteMany({ where: { updatedAt: { lt: cutoff(RETENTION.superAgentConversation) } } })),
            safe((db as any).leadGeneratorConversation?.deleteMany({ where: { updatedAt: { lt: cutoff(RETENTION.leadGeneratorConversation) } } })),
            safe((db as any).nodePreviewCache?.deleteMany({ where: { updatedAt: { lt: cutoff(RETENTION.nodePreviewCache) } } })),
            // Expired auth artifacts (always safe to prune)
            safe((db as any).session?.deleteMany({ where: { expires: { lt: new Date(now) } } })),
            safe((db as any).verificationToken?.deleteMany({ where: { expires: { lt: new Date(now) } } })),
            safe((db as any).passwordResetToken?.deleteMany({ where: { expires: { lt: new Date(now) } } })),
        ]);

        const result = {
            retention: RETENTION,
            deleted: {
                scheduledTaskExecutions: executions?.count ?? 0,
                triggerLogs: triggerLogs?.count ?? 0,
                agentConversations: agentConv?.count ?? 0,
                auditLogs: auditLogs?.count ?? 0,
                superAgentConversations: superAgentConv?.count ?? 0,
                leadGeneratorConversations: leadGenConv?.count ?? 0,
                nodePreviewCache: previewCache?.count ?? 0,
                expiredSessions: sessions?.count ?? 0,
                expiredVerificationTokens: verificationTokens?.count ?? 0,
                expiredPasswordResetTokens: passwordResetTokens?.count ?? 0,
            },
        };

        console.log('[retention-cleanup] Cleanup completed:', result);
        return NextResponse.json(result);
    } catch (error) {
        console.error('[retention-cleanup] Cleanup failed:', error);
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}
