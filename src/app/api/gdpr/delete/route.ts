import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * DELETE /api/gdpr/delete - GDPR Delete Account (Art. 17)
 * Deletes the authenticated user's account and all associated personal data.
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const user = session.user as { id: string; companyId: string; role: string };
  const userId = user.id;
  const companyId = user.companyId;

  // SECURITY M-06: rate limit — max 2 delete attempts per hour per user
  const rl = await rateLimit(`gdpr-delete:${userId}`, 2, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Troppi tentativi. Riprova più tardi.' }, { status: 429 });
  }

  try {
    const body = await request.json();

    // Safety check: require explicit confirmation
    if (body?.confirmation !== 'DELETE MY ACCOUNT') {
      return NextResponse.json(
        { error: 'Conferma richiesta: inviare { "confirmation": "DELETE MY ACCOUNT" }' },
        { status: 400 }
      );
    }

    // Admin/superadmin cannot delete themselves
    if (user.role === 'admin' || user.role === 'superadmin') {
      return NextResponse.json(
        { error: 'Gli amministratori non possono eliminare il proprio account. Richiedere prima la rimozione del ruolo admin.' },
        { status: 403 }
      );
    }

    // Check for active scheduled tasks
    const activeTasks = await db.scheduledTask.count({
      where: { createdBy: userId, status: 'active' },
    });

    if (activeTasks > 0) {
      return NextResponse.json(
        { error: `Impossibile eliminare: ci sono ${activeTasks} task schedulati attivi. Disattivarli prima di procedere.` },
        { status: 409 }
      );
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

    // Audit log BEFORE deletion (so we capture it while user still exists)
    await auditLog({
      userId,
      companyId,
      action: 'gdpr.delete',
      details: { email: (session.user as { email?: string }).email },
      ipAddress: ipAddress || undefined,
    });

    console.log(`[GDPR Delete] Deleting account for user ${userId} (company ${companyId})`);

    // Delete in a transaction so a partial failure rolls back.
    // Order respects FK constraints.
    // Company-scoped tables (AgentConversation, LeadSearch, Lead, WhatsAppSession,
    // WhatsAppContact, SuperAgentConversation, LeadGeneratorConversation) are NOT
    // deleted here — they belong to the company and may contain other users' work.
    // AuditLog is retained but pseudonymized (legal/regulatory retention obligation).
    await db.$transaction([
      // ScheduledTask where createdBy = userId (inactive only, we checked above)
      db.scheduledTask.deleteMany({ where: { createdBy: userId } }),
      // PageLayout where userId
      db.pageLayout.deleteMany({ where: { userId } }),
      // ConsentLog where userId (GDPR Art. 17 — consent records for this user)
      db.consentLog.deleteMany({ where: { userId } }),
      // VpnPeer where userId
      db.vpnPeer.deleteMany({ where: { userId } }),
      // PasswordResetToken is keyed by email — delete
      db.passwordResetToken.deleteMany({
        where: { email: (session.user as { email?: string }).email || '' },
      }),
      // AuditLog: pseudonymize userId to preserve audit trail while removing PII
      db.auditLog.updateMany({
        where: { userId },
        data: { userId: `deleted-${Date.now()}`, ipAddress: null },
      }),
      // Account where userId (OAuth accounts)
      db.account.deleteMany({ where: { userId } }),
      // Session where userId
      db.session.deleteMany({ where: { userId } }),
      // User where id = userId
      db.user.delete({ where: { id: userId } }),
    ]);

    console.log(`[GDPR Delete] Account deleted for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Account e dati personali eliminati',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore interno del server';
    console.error('[GDPR Delete] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
