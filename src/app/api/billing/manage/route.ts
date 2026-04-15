import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

let stripeClient: any = null;
try {
  const { stripe } = require('@/lib/stripe');
  stripeClient = stripe;
} catch {
  // Stripe module not configured yet
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { role, companyId } = session.user as any;
  if (role !== 'admin' && role !== 'superadmin') {
    return NextResponse.json({ error: 'Accesso riservato agli amministratori' }, { status: 403 });
  }

  if (!companyId) {
    return NextResponse.json({ error: 'Company non trovata nella sessione' }, { status: 400 });
  }

  if (!stripeClient) {
    return NextResponse.json({ error: 'Stripe non configurato' }, { status: 503 });
  }

  let body: { action: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  const { action } = body;
  if (!action || !['cancel', 'reactivate', 'portal'].includes(action)) {
    return NextResponse.json(
      { error: 'Azione non valida. Azioni supportate: cancel, reactivate, portal' },
      { status: 400 },
    );
  }

  try {
    // Look up the Stripe customer for this company
    const { db } = await import('@/lib/db');
    const subscription = await (db as any).subscription.findUnique({
      where: { companyId },
      select: { stripeCustomerId: true, stripeSubscriptionId: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'Nessun abbonamento trovato' }, { status: 404 });
    }

    if (action === 'portal') {
      const portalSession = await stripeClient.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${process.env.NEXTAUTH_URL || req.nextUrl.origin}/settings/billing`,
      });
      return NextResponse.json({ url: portalSession.url });
    }

    if (action === 'cancel') {
      await stripeClient.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      return NextResponse.json({ success: true, message: 'Abbonamento in cancellazione a fine periodo' });
    }

    if (action === 'reactivate') {
      await stripeClient.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
      return NextResponse.json({ success: true, message: 'Abbonamento riattivato' });
    }

    return NextResponse.json({ error: 'Azione non gestita' }, { status: 400 });
  } catch (err: any) {
    console.error('[billing/manage] Error:', err?.message || err);
    return NextResponse.json({ error: 'Errore durante la gestione dell\'abbonamento' }, { status: 500 });
  }
}
