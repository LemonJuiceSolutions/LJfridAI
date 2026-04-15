import { describe, it, expect } from 'vitest';
import { hasFeature, getPlanLimits } from '@/lib/feature-gate';

describe('hasFeature', () => {
  it('free plan includes trees', () => {
    expect(hasFeature('free', 'trees')).toBe(true);
  });

  it('free plan does not include pipelines', () => {
    expect(hasFeature('free', 'pipelines')).toBe(false);
  });

  it('starter plan includes scheduler', () => {
    expect(hasFeature('starter', 'scheduler')).toBe(true);
  });

  it('starter plan does not include leads', () => {
    expect(hasFeature('starter', 'leads')).toBe(false);
  });

  it('professional plan includes leads', () => {
    expect(hasFeature('professional', 'leads')).toBe(true);
  });

  it('enterprise plan includes any feature via "all"', () => {
    expect(hasFeature('enterprise', 'anything')).toBe(true);
  });

  it('enterprise plan includes leads', () => {
    expect(hasFeature('enterprise', 'leads')).toBe(true);
  });

  it('unknown plan defaults to free features', () => {
    expect(hasFeature('unknown-plan', 'trees')).toBe(true);
    expect(hasFeature('unknown-plan', 'pipelines')).toBe(false);
  });
});

describe('getPlanLimits', () => {
  it('free plan returns maxUsers 3 and maxTrees 10', () => {
    expect(getPlanLimits('free')).toEqual({ maxUsers: 3, maxTrees: 10 });
  });

  it('enterprise plan returns unlimited (-1) for both', () => {
    expect(getPlanLimits('enterprise')).toEqual({ maxUsers: -1, maxTrees: -1 });
  });

  it('starter plan returns maxUsers 10 and maxTrees 50', () => {
    expect(getPlanLimits('starter')).toEqual({ maxUsers: 10, maxTrees: 50 });
  });

  it('professional plan returns maxUsers 50 and maxTrees -1', () => {
    expect(getPlanLimits('professional')).toEqual({ maxUsers: 50, maxTrees: -1 });
  });

  it('unknown plan defaults to free limits', () => {
    expect(getPlanLimits('unknown')).toEqual({ maxUsers: 3, maxTrees: 10 });
  });
});
