import type { ObjectStorage } from '../../providers/storage';
import type { Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../../errors/ApiError';
import { type ErrorDetail } from '@takeoff/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { can } from '../../middleware/policy';
import {
  completeUpload,
  createProject,
  createUpload,
  deleteProject,
  deleteUpload,
  getProject,
  listFiles,
  listProjects,
  submitProject,
  updateProject,
} from './project.service';
import { getLatestJobByProject, evaluateSla, mapCustomerProgress } from '../jobs/job.service';
import {
  createProjectBodySchema,
  createUploadBodySchema,
  updateProjectBodySchema,
  type CreateProjectInput,
  type CreateUploadInput,
  type UpdateProjectInput,
} from './project.schemas';

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

export function createCreateProjectHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const parsed = createProjectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const project = await createProject(user.id, parsed.data as CreateProjectInput);
    res.status(201).json({ project });
  });
}

export function createListProjectsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const projects = await listProjects(user.id);
    res.json({ projects });
  });
}

export function createGetProjectHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const project = await getProject(user.id, requireParam(req, 'id'));
    if (project === null) {
      throw new ApiError(404, 'NOT_FOUND', 'Project not found');
    }
    res.json({ project });
  });
}

export function createUpdateProjectHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const parsed = updateProjectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const project = await updateProject(
      user.id,
      requireParam(req, 'id'),
      parsed.data as UpdateProjectInput,
    );
    const allowed = can(user, 'project.update', { ownerId: project.ownerId });
    if (!allowed) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
    }
    res.json({ project });
  });
}

export function createDeleteProjectHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const allowed = can(user, 'project.delete', { ownerId: user.id });
    if (!allowed) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
    }
    await deleteProject(user.id, requireParam(req, 'id'));
    res.json({ ok: true });
  });
}

export function createCreateUploadHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const parsed = createUploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const { fileId, upload } = await createUpload(
      storage,
      user.id,
      requireParam(req, 'id'),
      parsed.data as CreateUploadInput,
    );
    res.status(201).json({ fileId, upload });
  });
}

export function createCompleteUploadHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const file = await completeUpload(
      storage,
      user.id,
      requireParam(req, 'id'),
      requireParam(req, 'fileId'),
    );
    res.json({ file });
  });
}

export function createDeleteUploadHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    await deleteUpload(storage, user.id, requireParam(req, 'id'), requireParam(req, 'fileId'));
    res.json({ ok: true });
  });
}

export function createListFilesHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const files = await listFiles(user.id, requireParam(req, 'id'));
    res.json({ files });
  });
}

export function createSubmitProjectHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const allowed = can(user, 'project.submit', { ownerId: user.id });
    if (!allowed) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
    }
    const { job, created } = await submitProject(user.id, requireParam(req, 'id'));
    res.status(created ? 201 : 200).json({ job });
  });
}

export function createGetProjectStatusHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const project = await getProject(user.id, requireParam(req, 'id'));
    if (project === null) {
      throw new ApiError(404, 'NOT_FOUND', 'Project not found');
    }
    const allowed = can(user, 'project.read', { ownerId: user.id });
    if (!allowed) {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
    }
    const job = await getLatestJobByProject(requireParam(req, 'id'));
    if (job === null) {
      throw new ApiError(404, 'NOT_FOUND', 'Job not found');
    }
    const currentJob = await evaluateSla(job._id.toString());
    res.json({
      job: currentJob,
      progress: mapCustomerProgress(currentJob.status),
      targetDeadlineAt: currentJob.sla.deadlineAt,
    });
  });
}
