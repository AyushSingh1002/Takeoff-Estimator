import type { Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorDetail } from '@takeoff/shared';
import { ApiError } from '../../errors/ApiError';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  approveRulePack,
  assignJobReviewer,
  cancelJob,
  createRulePack,
  listAuditLogs,
  listJobs,
  listProjects,
  listRulePacks,
  listUsers,
  retireRulePack,
  rerunJob,
  retryJob,
  updateUser,
} from './admin.service';
import {
  adminJobListQuerySchema,
  adminProjectListQuerySchema,
  adminUserListQuerySchema,
  assignJobBodySchema,
  auditLogQuerySchema,
  rulePackCreateBodySchema,
  rulePackListQuerySchema,
  updateUserBodySchema,
} from './admin.schemas';

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), issue: issue.code }));
}

function requireUser(req: Request): { id: string } {
  const user = req.user;
  if (user === undefined) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session token required');
  }
  return { id: user.id };
}

function requireParam(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== 'string') {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  return value;
}

function validationError(error: ZodError): ApiError {
  return new ApiError(400, 'VALIDATION_FAILED', 'Validation failed', toErrorDetails(error));
}

export function createListUsersHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = adminUserListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const users = await listUsers(parsed.data);
    res.json({ users });
  });
}

export function createUpdateUserHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = updateUserBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const updated = await updateUser(user.id, requireParam(req, 'id'), parsed.data);
    res.json({ user: updated });
  });
}

export function createListProjectsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = adminProjectListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const projects = await listProjects(parsed.data);
    res.json({ projects });
  });
}

export function createListJobsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = adminJobListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const jobs = await listJobs(parsed.data);
    res.json({ jobs });
  });
}

export function createAssignJobHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = assignJobBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const review = await assignJobReviewer(
      user.id,
      requireParam(req, 'id'),
      parsed.data.reviewerId,
    );
    res.status(201).json({ review });
  });
}

export function createRetryJobHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const job = await retryJob(user.id, requireParam(req, 'id'));
    res.json({ job });
  });
}

export function createRerunJobHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const job = await rerunJob(user.id, requireParam(req, 'id'));
    res.json({ job });
  });
}

export function createCancelJobHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const job = await cancelJob(user.id, requireParam(req, 'id'));
    res.json({ job });
  });
}

export function createListRulePacksHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = rulePackListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const rulePacks = await listRulePacks(parsed.data);
    res.json({ rulePacks });
  });
}

export function createCreateRulePackHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const parsed = rulePackCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const rulePack = await createRulePack(user.id, parsed.data);
    res.status(201).json({ rulePack });
  });
}

export function createApproveRulePackHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const rulePack = await approveRulePack(user.id, requireParam(req, 'id'));
    res.json({ rulePack });
  });
}

export function createRetireRulePackHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const rulePack = await retireRulePack(user.id, requireParam(req, 'id'));
    res.json({ rulePack });
  });
}

export function createListAuditLogsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = auditLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw validationError(parsed.error);
    }
    const logs = await listAuditLogs(parsed.data);
    res.json({ logs });
  });
}
