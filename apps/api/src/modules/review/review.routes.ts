import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import type { ObjectStorage } from '../../providers/storage';
import {
  createAddManualMeasurementHandler,
  createApproveJobHandler,
  createAssignJobHandler,
  createGetJobDetailHandler,
  createGetReviewSheetHandler,
  createListAssignedJobsHandler,
  createListBoqItemsHandler,
  createListDiscrepanciesHandler,
  createListReviewSheetsHandler,
  createRejectJobHandler,
  createResolveDiscrepancyHandler,
  createReviewBoqHandler,
  createUpdateMeasurementHandler,
} from './review.controller';

export function createReviewRouter(deps: { storage: ObjectStorage }): Router {
  const router = Router();

  router.get(
    '/review/jobs',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createListAssignedJobsHandler()),
  );
  router.get(
    '/review/jobs/:jobId',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createGetJobDetailHandler()),
  );
  router.get(
    '/review/jobs/:jobId/sheets',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createListReviewSheetsHandler()),
  );
  router.get(
    '/review/jobs/:jobId/sheets/:sheetId',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createGetReviewSheetHandler(deps.storage)),
  );
  router.get(
    '/review/jobs/:jobId/boq',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createListBoqItemsHandler()),
  );
  router.get(
    '/review/jobs/:jobId/discrepancies',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createListDiscrepanciesHandler()),
  );
  router.patch(
    '/review/jobs/:jobId/measurements/:measurementId',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createUpdateMeasurementHandler()),
  );
  router.post(
    '/review/jobs/:jobId/measurements',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createAddManualMeasurementHandler()),
  );
  router.patch(
    '/review/jobs/:jobId/boq/:itemId',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createReviewBoqHandler()),
  );
  router.patch(
    '/review/jobs/:jobId/discrepancies/:discrepancyId',
    authenticate,
    requirePolicy('job.review'),
    asyncHandler(createResolveDiscrepancyHandler()),
  );
  router.post(
    '/review/jobs/:jobId/approve',
    authenticate,
    requirePolicy('job.approve'),
    asyncHandler(createApproveJobHandler(deps.storage)),
  );
  router.post(
    '/review/jobs/:jobId/reject',
    authenticate,
    requirePolicy('job.reject'),
    asyncHandler(createRejectJobHandler()),
  );
  router.post(
    '/admin/jobs/:jobId/assign',
    authenticate,
    requirePolicy('admin.jobs.assign'),
    asyncHandler(createAssignJobHandler()),
  );

  return router;
}
