import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET /api/gdpr/export - GDPR Data Export (Art. 15, 20)
 * Returns all personal data for the authenticated user as a JSON download.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const user = session.user as { id: string; companyId: string };
  const userId = user.id;
  const companyId = user.companyId;

  // SECURITY M-06: rate limit — max 5 exports per hour per user
  const rl = await rateLimit(`gdpr-export:${userId}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Troppi tentativi. Riprova più tardi.' }, { status: 429 });
  }

  try {
    // Fetch user profile (exclude password hash)
    const profile = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        role: true,
        companyId: true,
        departmentId: true,
        createdAt: true,
        updatedAt: true,
        openRouterAgentModel: true,
        openRouterModel: true,
        aiProvider: true,
        claudeCliModel: true,
        sqlAgentModel: true,
        pythonAgentModel: true,
        roleId: true,
        // password explicitly excluded
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
    }

    // GDPR Art. 15/20: export the requesting user's personal data.
    // Conversations with userId are filtered per-user (preferred).
    // Records without userId fall back to companyId scope.
    // WhatsApp/Lead models remain company-scoped (no userId field).
    const [
      tasks,
      pageLayouts,
      consentLogs,
      auditLogs,
      vpnPeers,
      conversations,
      superAgentConversations,
      leadGeneratorConversations,
      searches,
      leads,
      whatsappSessions,
      whatsappContacts,
    ] = await Promise.all([
      // User-specific data (always filtered by userId)
      db.scheduledTask.findMany({ where: { createdBy: userId } }),
      db.pageLayout.findMany({ where: { userId } }),
      db.consentLog.findMany({ where: { userId } }),
      db.auditLog.findMany({ where: { userId } }),
      db.vpnPeer.findMany({ where: { userId } }),
      // Conversations: prefer userId filter, fall back to companyId for legacy records
      db.agentConversation.findMany({ where: { companyId, OR: [{ userId }, { userId: null }] } }),
      db.superAgentConversation.findMany({ where: { companyId, OR: [{ userId }, { userId: null }] } }),
      db.leadGeneratorConversation.findMany({ where: { companyId, OR: [{ userId }, { userId: null }] } }),
      // Company-scoped (no userId field)
      db.leadSearch.findMany({ where: { companyId } }),
      db.lead.findMany({ where: { companyId } }),
      db.whatsAppSession.findMany({ where: { companyId } }),
      db.whatsAppContact.findMany({ where: { companyId } }),
    ]);

    const exportDate = new Date().toISOString();
    const dateStr = new Date().toISOString().split('T')[0];

    const exportData = {
      exportDate,
      userId,
      companyId,
      profile,
      // User-specific personal data (Art. 15/20)
      personalData: {
        pageLayouts,
        consentLogs,
        auditLogs,
        vpnPeers,
        tasksCreated: tasks,
      },
      // Company-scoped shared data — these models lack a userId column,
      // so all company records are included. Future migration will add
      // userId for per-user attribution (GDPR Art. 15 data minimization).
      companySharedData: {
        note: 'Questi dati sono condivisi a livello aziendale. I modelli non hanno un campo userId per il filtraggio individuale.',
        conversations,
        superAgentConversations,
        leadGeneratorConversations,
        searches,
        leads,
        whatsappSessions,
        whatsappContacts,
      },
    };

    // Audit log
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    await auditLog({
      userId,
      companyId,
      action: 'gdpr.export',
      details: {
        conversationCount: conversations.length,
        superAgentConversationCount: superAgentConversations.length,
        leadGeneratorConversationCount: leadGeneratorConversations.length,
        searchCount: searches.length,
        leadCount: leads.length,
        whatsappSessionCount: whatsappSessions.length,
        whatsappContactCount: whatsappContacts.length,
        taskCount: tasks.length,
        pageLayoutCount: pageLayouts.length,
        consentLogCount: consentLogs.length,
        auditLogCount: auditLogs.length,
        vpnPeerCount: vpnPeers.length,
      },
      ipAddress: ipAddress || undefined,
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="gdpr-export-${userId}-${dateStr}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore interno del server';
    console.error('[GDPR Export] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
