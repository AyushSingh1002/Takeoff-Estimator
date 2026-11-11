import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError';
import { asyncHandler } from '../../middleware/asyncHandler';
import { getProject } from '../projects/project.service';
import {
  compileDeliverables,
  downloadDeliverable,
  listDeliveredBoq,
  listDeliverablesForProject,
} from './deliverable.service';
import type { ObjectStorage } from '../../providers/storage';

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

export function createListDeliverablesHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const projectId = requireParam(req, 'id');
    const project = await getProject(user.id, projectId);
    if (project === null) {
      throw new ApiError(404, 'NOT_FOUND', 'Project not found');
    }
    const deliverables = await listDeliverablesForProject(projectId);
    res.json({ deliverables });
  });
}

export function createListDeliveredBoqHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const projectId = requireParam(req, 'id');
    const project = await getProject(user.id, projectId);
    if (project === null) {
      throw new ApiError(404, 'NOT_FOUND', 'Project not found');
    }
    const boqItems = await listDeliveredBoq(projectId);
    res.json({ boqItems });
  });
}

export function createDownloadDeliverableHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const deliverableId = requireParam(req, 'id');
    const { url, expiresIn } = await downloadDeliverable({
      deliverableId,
      actorId: user.id,
      actorRole: user.role,
      storage,
    });
    res.json({ deliverableId, url, expiresIn });
  });
}

export function createDeliverJobHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const jobId = requireParam(req, 'jobId');
    const deliverables = await compileDeliverables({
      jobId,
      actorId: user.id,
      actorRole: user.role === 'admin' ? 'admin' : 'reviewer',
      storage,
    });
    res.status(201).json({ deliverables });
  });
}
