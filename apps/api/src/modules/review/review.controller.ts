import type { Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../../errors/ApiError';
import { asyncHandler } from '../../middleware/asyncHandler';
import { logger } from '../../middleware/logger';
import type { ObjectStorage } from '../../providers/storage';
import {
  addManualMeasurement,
  approveJobAndDeliver,
  assignReviewer,
  DeliverableCompilationError,
  getJobDetail,
  getReviewSheetDetail,
  listAssignedJobs,
  listBoqItems,
  listDiscrepancies,
  listReviewSheets,
  rejectJob,
  resolveDiscrepancy,
  reviewBoqItem,
  updateMeasurement,
} from './review.service';
import {
  updateMeasurementBodySchema,
  addManualMeasurementBodySchema,
  assignJobBodySchema,
  rejectJobBodySchema,
  resolveDiscrepancyBodySchema,
  reviewBoqBodySchema,
} from './review.schemas';
import type { ErrorDetail } from '@takeoff/shared';

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    issue: issue.code,
  }));
}

function getAuthUser(req: Request): { id: string; role: 'customer' | 'reviewer' | 'admin' } {
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

export function createListAssignedJobsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobs = await listAssignedJobs(user.id);
    res.json({ jobs });
  });
}

export function createGetJobDetailHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const detail = await getJobDetail(jobId, user.id);
    res.json(detail);
  });
}

export function createListReviewSheetsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const sheets = await listReviewSheets(jobId, user.id);
    res.json({ sheets });
  });
}

export function createGetReviewSheetHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const sheetId = requireParam(req, 'sheetId');
    const detail = await getReviewSheetDetail(storage, jobId, sheetId, user.id);
    res.json(detail);
  });
}

export function createListBoqItemsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const boqItems = await listBoqItems(jobId, user.id);
    res.json({ boqItems });
  });
}

export function createListDiscrepanciesHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
    const discrepancies = await listDiscrepancies(jobId, user.id, { status, severity });
    res.json({ discrepancies });
  });
}

export function createUpdateMeasurementHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const measurementId = requireParam(req, 'measurementId');
    const parsed = updateMeasurementBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const measurement = await updateMeasurement({
      jobId,
      measurementId,
      reviewerId: user.id,
      value: parsed.data.value,
      geometry: parsed.data.geometry,
      note: parsed.data.note,
    });
    res.json({ measurement });
  });
}

export function createAddManualMeasurementHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const parsed = addManualMeasurementBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const measurement = await addManualMeasurement({
      jobId,
      reviewerId: user.id,
      type: parsed.data.type,
      value: parsed.data.value,
      unit: parsed.data.unit,
      note: parsed.data.note,
    });
    res.status(201).json({ measurement });
  });
}

export function createReviewBoqHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const itemId = requireParam(req, 'itemId');
    const parsed = reviewBoqBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const boqItem = await reviewBoqItem({
      jobId,
      itemId,
      reviewerId: user.id,
      decision: parsed.data.decision,
      value: parsed.data.value,
      reason: parsed.data.reason,
    });
    res.json({ boqItem });
  });
}

export function createResolveDiscrepancyHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const discrepancyId = requireParam(req, 'discrepancyId');
    const parsed = resolveDiscrepancyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const discrepancy = await resolveDiscrepancy({
      jobId,
      discrepancyId,
      reviewerId: user.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    res.json({ discrepancy });
  });
}

export function createApproveJobHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    try {
      const job = await approveJobAndDeliver({
        jobId,
        reviewerId: user.id,
        storage,
      });
      res.json({ job });
    } catch (error: unknown) {
      if (!(error instanceof DeliverableCompilationError)) {
        throw error;
      }
      logger.error({ err: error.cause, jobId }, 'delivery_compile_failed');
      throw new ApiError(
        502,
        'DELIVERY_COMPILE_FAILED',
        'Job approved, but deliverables could not be compiled. Retry delivery from the job review page.',
      );
    }
  });
}

export function createRejectJobHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const parsed = rejectJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const job = await rejectJob({ jobId, reviewerId: user.id, reason: parsed.data.reason });
    res.json({ job });
  });
}

export function createAssignJobHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const parsed = assignJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const review = await assignReviewer({
      jobId,
      reviewerId: parsed.data.reviewerId,
      assignedBy: user.id,
    });
    res.status(201).json({ review });
  });
}
