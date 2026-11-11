import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import {
  createClaimDecisionHandler,
  createFileAccuracyClaimHandler,
  createGetAccuracyClaimHandler,
  createListAccuracyClaimsHandler,
  createRecordBenchmarkHandler,
} from './accuracy.controller';

export function createAccuracyRouter(): Router {
  const router = Router();

  router.post(
    '/projects/:id/accuracy-claims',
    authenticate,
    requirePolicy('accuracy.claim.create'),
    asyncHandler(createFileAccuracyClaimHandler()),
  );
  router.get(
    '/accuracy-claims',
    authenticate,
    requirePolicy('accuracy.claim.list'),
    asyncHandler(createListAccuracyClaimsHandler()),
  );
  router.get(
    '/admin/accuracy-claims/:id',
    authenticate,
    requirePolicy('admin.accuracy'),
    asyncHandler(createGetAccuracyClaimHandler()),
  );
  router.post(
    '/admin/accuracy-claims/:id/benchmark',
    authenticate,
    requirePolicy('admin.accuracy'),
    asyncHandler(createRecordBenchmarkHandler()),
  );
  router.post(
    '/admin/accuracy-claims/:id/decision',
    authenticate,
    requirePolicy('admin.accuracy'),
    asyncHandler(createClaimDecisionHandler()),
  );

  return router;
}
