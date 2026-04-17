import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

// Map Stripe price IDs to plan names
function getPlanFromPriceId(priceId: string | null): string {
  if (!priceId) return 'free';
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL) return 'professional';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return 'free';
}

// In Stripe v22+, current_period_start/end live on subscription items
function getPeriodDates(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    currentPeriodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
  };
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('[billing/webhook] Signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    // BUG fix: atomic idempotency. Was: separate findUnique + create — two
    // concurrent Stripe retries could both find "not existing" and both
    // execute the handler (duplicate emails / state changes).
    // Now: single create — Prisma P2002 unique-violation indicates duplicate.
    try {
      await db.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // Duplicate — another delivery already processed it
        console.log(`[billing/webhook] Skipping duplicate event ${event.id}`);
        return NextResponse.json({ received: true });
      }
      // Table may not exist (migration pending) — log + continue without dedup
      console.warn(`[billing/webhook] Idempotency table unavailable: ${e?.message || e}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!companyId) {
          console.error('[billing/webhook] No companyId in session metadata');
          break;
        }

        // Retrieve the subscription to get price info
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const { currentPeriodStart, currentPeriodEnd } = getPeriodDates(subscription);

        await db.subscription.upsert({
          where: { companyId },
          create: {
            companyId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: priceId,
            plan: getPlanFromPriceId(priceId),
            status: subscription.status,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
          update: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: priceId,
            plan: getPlanFromPriceId(priceId),
            status: subscription.status,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const { currentPeriodStart, currentPeriodEnd } = getPeriodDates(subscription);

        await db.subscription.update({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            plan: getPlanFromPriceId(priceId),
            status: subscription.status,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await db.subscription.update({
          where: { stripeCustomerId: customerId },
          data: {
            status: 'canceled',
            cancelAtPeriodEnd: false,
          },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await db.subscription.update({
          where: { stripeCustomerId: customerId },
          data: { status: 'past_due' },
        });
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[billing/webhook] Handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
