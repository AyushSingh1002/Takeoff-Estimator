import { PricingPlan } from './pricingPlan.model';
import { publishPricingPlan } from './pricing.service';

/**
 * Central pricing seed. The MVP numbers live in the documents (MVP_SCOPE.md) and
 * are published as ordinary versioned PricingPlan records; no price is embedded
 * in UI or business code. Production pricing is managed by admins via the API.
 */
export const SEED_PLANS = [
  {
    code: 'free_trial' as const,
    currency: 'USD',
    amountMinor: 0,
    parameters: { includedTakeoffs: 1, maxSheets: 10, turnaroundHours: 24 },
  },
  {
    code: 'per_takeoff' as const,
    currency: 'USD',
    amountMinor: 25000,
    parameters: { maxSheets: 300, turnaroundHours: 24 },
  },
  {
    code: 'unlimited' as const,
    currency: 'USD',
    amountMinor: 250000,
    parameters: {
      includedTakeoffs: 25,
      overageAmountMinor: 9900,
      maxSheets: 300,
      turnaroundHours: 24,
    },
  },
];

export async function seedPricingPlans(actorId = 'system'): Promise<void> {
  for (const seed of SEED_PLANS) {
    const existing = await PricingPlan.findOne({ code: seed.code });
    if (existing !== null) {
      continue;
    }
    await publishPricingPlan(seed, actorId);
  }
}
