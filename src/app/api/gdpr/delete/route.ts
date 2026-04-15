import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/audit';

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

    // Delete in order to respect FK constraints
    // 1. AgentConversation (scoped by companyId — these are company-level, but we delete user's data)
    //    Note: AgentConversation has no userId field, it's company-scoped.
    //    We skip this as it's shared company data, not personal data.

    // 2. LeadSearch (company-scoped, no userId)
    //    Same as above — shared company data.

    // 3. ScheduledTask where createdBy = userId (inactive only, we checked above)
    await db.scheduledTask.deleteMany({
      where: { createdBy: userId },
    });

    // 4. PageLayout where userId
    await db.pageLayout.deleteMany({
      where: { userId },
    });

    // 5. Account where userId (OAuth accounts)
    await db.account.deleteMany({
      where: { userId },
    });

    // 6. Session where userId
    await db.session.deleteMany({
      where: { userId },
    });

    // 7. User where id = userId
    await db.user.delete({
      where: { id: userId },
    });

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
