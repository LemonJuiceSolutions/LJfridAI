import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export const PLANS = {
  free: { name: 'Free', maxUsers: 3, maxTrees: 10, features: ['basic'] },
  starter: { name: 'Starter', maxUsers: 10, maxTrees: 50, features: ['basic', 'scheduler', 'agents'] },
  professional: { name: 'Professional', maxUsers: 50, maxTrees: -1, features: ['basic', 'scheduler', 'agents', 'pipelines', 'leads'] },
  enterprise: { name: 'Enterprise', maxUsers: -1, maxTrees: -1, features: ['all'] },
} as const;

export type PlanType = keyof typeof PLANS;
