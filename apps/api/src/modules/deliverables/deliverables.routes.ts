import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import {
  createDeliverJobHandler,
  createDownloadDeliverableHandler,
  createListDeliverablesHandler,
  createListDeliveredBoqHandler,
} from './deliverables.controller';
import type { ObjectStorage } from '../../providers/storage';

export function createDeliverablesRouter(deps: { storage: ObjectStorage }): Router {
  const router = Router();

  router.get(
    '/projects/:id/deliverables',
    authenticate,
    asyncHandler(createListDeliverablesHandler()),
  );
  router.get('/projects/:id/boq', authenticate, asyncHandler(createListDeliveredBoqHandler()));
  router.get(
    '/deliverables/:id/download',
    authenticate,
    requirePolicy('deliverable.download'),
    asyncHandler(createDownloadDeliverableHandler(deps.storage)),
  );
  router.post(
    '/jobs/:jobId/deliver',
    authenticate,
    requirePolicy('job.deliver'),
    asyncHandler(createDeliverJobHandler(deps.storage)),
  );

  return router;
}
