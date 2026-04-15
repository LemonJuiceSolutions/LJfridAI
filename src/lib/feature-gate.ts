import { db } from '@/lib/db';

const PLAN_FEATURES: Record<string, string[]> = {
  free: ['trees', 'detai'],
  starter: ['trees', 'detai', 'scheduler', 'agents', 'connectors'],
  professional: ['trees', 'detai', 'scheduler', 'agents', 'connectors', 'pipelines', 'leads', 'super-agent'],
  enterprise: ['all'],
};

const PLAN_LIMITS: Record<string, { maxUsers: number; maxTrees: number }> = {
  free: { maxUsers: 3, maxTrees: 10 },
  starter: { maxUsers: 10, maxTrees: 50 },
  professional: { maxUsers: 50, maxTrees: -1 },
  enterprise: { maxUsers: -1, maxTrees: -1 },
};

export async function getCompanyPlan(companyId: string): Promise<string> {
  try {
    const subscription = await (db as any).subscription.findUnique({
      where: { companyId },
      select: { plan: true, status: true },
    });
    if (!subscription || subscription.status === 'canceled') return 'free';
    return subscription.plan;
  } catch {
    // If Subscription table doesn't exist yet, default to free
    return 'free';
  }
}

export function hasFeature(plan: string, feature: string): boolean {
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
  return features.includes('all') || features.includes(feature);
}

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function checkFeatureAccess(companyId: string, feature: string): Promise<{ allowed: boolean; plan: string; message?: string }> {
  const plan = await getCompanyPlan(companyId);
  const allowed = hasFeature(plan, feature);
  return {
    allowed,
    plan,
    message: allowed ? undefined : `La funzionalit\u00e0 "${feature}" richiede un piano superiore. Piano attuale: ${plan}`,
  };
}

export async function checkUserLimit(companyId: string): Promise<{ allowed: boolean; current: number; max: number }> {
  const plan = await getCompanyPlan(companyId);
  const limits = getPlanLimits(plan);
  if (limits.maxUsers === -1) return { allowed: true, current: 0, max: -1 };

  const current = await db.user.count({ where: { companyId } });
  return { allowed: current < limits.maxUsers, current, max: limits.maxUsers };
}

export async function checkTreeLimit(companyId: string): Promise<{ allowed: boolean; current: number; max: number }> {
  const plan = await getCompanyPlan(companyId);
  const limits = getPlanLimits(plan);
  if (limits.maxTrees === -1) return { allowed: true, current: 0, max: -1 };

  const current = await db.tree.count({ where: { companyId } });
  return { allowed: current < limits.maxTrees, current, max: limits.maxTrees };
}
