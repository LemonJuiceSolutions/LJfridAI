import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role, companyId } = session.user as any;

    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only admins can manage billing' },
        { status: 403 }
      );
    }

    const { priceId } = await request.json();

    if (!priceId) {
      return NextResponse.json(
        { error: 'priceId is required' },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    // Look up existing subscription record for stripe customer
    const existingSubscription = await db.subscription.findUnique({
      where: { companyId },
    });

    let stripeCustomerId: string;

    if (existingSubscription?.stripeCustomerId) {
      stripeCustomerId = existingSubscription.stripeCustomerId;
    } else {
      // Create a new Stripe customer
      const company = await db.company.findUnique({
        where: { id: companyId },
      });

      const customer = await stripe.customers.create({
        name: company?.name ?? undefined,
        metadata: { companyId },
      });

      stripeCustomerId = customer.id;

      // Upsert subscription record with the new customer ID
      await db.subscription.upsert({
        where: { companyId },
        create: {
          companyId,
          stripeCustomerId,
        },
        update: {
          stripeCustomerId,
        },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/dashboard?billing=cancel`,
      metadata: { companyId },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error('[billing/checkout] Error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
