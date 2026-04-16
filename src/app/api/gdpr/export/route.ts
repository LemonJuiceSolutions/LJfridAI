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
  const rl = rateLimit(`gdpr-export:${userId}`, 5, 60 * 60 * 1000);
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

    // Fetch agent conversations
    const conversations = await db.agentConversation.findMany({
      where: { companyId },
    });

    // Fetch lead searches
    const searches = await db.leadSearch.findMany({
      where: { companyId },
    });

    // Fetch scheduled tasks created by this user
    const tasks = await db.scheduledTask.findMany({
      where: { createdBy: userId },
    });

    const exportDate = new Date().toISOString();
    const dateStr = new Date().toISOString().split('T')[0];

    const exportData = {
      exportDate,
      userId,
      profile,
      conversations,
      searches,
      tasks,
    };

    // Audit log
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    await auditLog({
      userId,
      companyId,
      action: 'gdpr.export',
      details: {
        conversationCount: conversations.length,
        searchCount: searches.length,
        taskCount: tasks.length,
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
