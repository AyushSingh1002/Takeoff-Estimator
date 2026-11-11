import { z } from 'zod';
import { PRICING_PLAN_CODES } from './pricingPlan.model';

const amountMinorSchema = z.number().int().min(0).max(1_000_000_000);

export const pricingPlanParametersSchema = z
  .object({
    includedTakeoffs: z.number().int().positive().max(100_000).optional(),
    overageAmountMinor: amountMinorSchema.optional(),
    maxSheets: z.number().int().positive().max(10_000).optional(),
    turnaroundHours: z
      .number()
      .positive()
      .max(24 * 30)
      .optional(),
  })
  .strict();

export const publishPricingPlanBodySchema = z
  .object({
    code: z.enum(PRICING_PLAN_CODES),
    effectiveFrom: z.coerce.date().optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, 'Currency must be an ISO 4217 code'),
    amountMinor: amountMinorSchema,
    parameters: pricingPlanParametersSchema.default({}),
  })
  .strict();

export const subscriptionBodySchema = z
  .object({
    userId: z.string().trim().min(1).max(128),
    action: z.enum(['grant', 'cancel']),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.periodStart === undefined ||
      value.periodEnd === undefined ||
      value.periodEnd.getTime() > value.periodStart.getTime(),
    { message: 'periodEnd must be after periodStart' },
  );

export const pricingPlanListQuerySchema = z
  .object({
    code: z.enum(PRICING_PLAN_CODES).optional(),
  })
  .strict();

export type PublishPricingPlanInput = z.infer<typeof publishPricingPlanBodySchema>;
export type SubscriptionInput = z.infer<typeof subscriptionBodySchema>;
