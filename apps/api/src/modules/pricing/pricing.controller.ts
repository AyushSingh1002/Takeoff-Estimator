import type { Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorDetail } from '@takeoff/shared';
import { ApiError } from '../../errors/ApiError';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  cancelSubscription,
  getUserUsage,
  grantSubscription,
  listPricingPlans,
  publishPricingPlan,
  quoteProject,
} from './pricing.service';
import {
  pricingPlanListQuerySchema,
  publishPricingPlanBodySchema,
  subscriptionBodySchema,
} from './pricing.schemas';

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), issue: issue.code }));
}

function requireUser(req: Request): { id: string; role: 'customer' | 'reviewer' | 'admin' } {
  const user = req.user;
  if (user === undefined) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session token required');
  }
  return { id: user.id, role: user.role };
}

function requireParam(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== 'string') {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  return value;
}

export function createQuoteHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const quote = await quoteProject(user.id, requireParam(req, 'id'));
    res.json({ quote });
  });
}

export function createUsageHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const usage = await getUserUsage(user.id);
    res.json({ usage });
  });
}

export function createListPricingPlansHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = pricingPlanListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const plans = await listPricingPlans(parsed.data.code);
    res.json({ plans });
  });
}

export function createPublishPricingPlanHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = publishPricingPlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const plan = await publishPricingPlan(parsed.data, user.id);
    res.status(201).json({ plan });
  });
}

export function createSubscriptionHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = subscriptionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    if (parsed.data.action === 'grant') {
      const subscription = await grantSubscription(parsed.data, user.id);
      res.status(201).json({ subscription });
      return;
    }
    await cancelSubscription(parsed.data, user.id);
    res.json({ ok: true });
  });
}
