import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import {
  createListPricingPlansHandler,
  createPublishPricingPlanHandler,
  createQuoteHandler,
  createSubscriptionHandler,
  createUsageHandler,
} from './pricing.controller';

export function createPricingRouter(): Router {
  const router = Router();

  router.get('/projects/:id/quote', authenticate, asyncHandler(createQuoteHandler()));
  router.get(
    '/me/usage',
    authenticate,
    requirePolicy('auth.profile.read'),
    asyncHandler(createUsageHandler()),
  );
  router.get(
    '/admin/pricing-plans',
    authenticate,
    requirePolicy('admin.pricing'),
    asyncHandler(createListPricingPlansHandler()),
  );
  router.post(
    '/admin/pricing-plans',
    authenticate,
    requirePolicy('admin.pricing'),
    asyncHandler(createPublishPricingPlanHandler()),
  );
  router.post(
    '/admin/subscriptions',
    authenticate,
    requirePolicy('admin.subscriptions'),
    asyncHandler(createSubscriptionHandler()),
  );

  return router;
}
