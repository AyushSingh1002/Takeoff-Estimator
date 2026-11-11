import type { Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorDetail } from '@takeoff/shared';
import { ApiError } from '../../errors/ApiError';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  decideAccuracyClaim,
  fileAccuracyClaim,
  getAccuracyClaimDetail,
  listAccuracyClaims,
  recordAccuracyBenchmark,
} from './accuracy.service';
import {
  accuracyClaimListQuerySchema,
  claimDecisionBodySchema,
  fileAccuracyClaimBodySchema,
  recordBenchmarkBodySchema,
} from './accuracy.schemas';

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), issue: issue.code }));
}

function validationError(error: ZodError): ApiError {
  return new ApiError(400, 'VALIDATION_FAILED', 'Validation failed', toErrorDetails(error));
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

export function createFileAccuracyClaimHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = fileAccuracyClaimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const claim = await fileAccuracyClaim(user.id, requireParam(req, 'id'), parsed.data);
    res.status(201).json({ claim });
  });
}

export function createListAccuracyClaimsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = accuracyClaimListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const claims = await listAccuracyClaims({ id: user.id, role: user.role }, parsed.data);
    res.json({ claims });
  });
}

export function createGetAccuracyClaimHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const detail = await getAccuracyClaimDetail(requireParam(req, 'id'));
    res.json(detail);
  });
}

export function createRecordBenchmarkHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = recordBenchmarkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const benchmark = await recordAccuracyBenchmark(user.id, requireParam(req, 'id'), parsed.data);
    res.status(201).json({ benchmark });
  });
}

export function createClaimDecisionHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = claimDecisionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const result = await decideAccuracyClaim(user.id, requireParam(req, 'id'), parsed.data);
    res.json(result);
  });
}
