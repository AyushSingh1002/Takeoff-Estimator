import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../errors/ApiError';

export const POLICY_ACTIONS = [
  'auth.profile.read',
  'auth.profile.update',
  'auth.password.change',
  'project.list',
  'project.create',
  'project.read',
  'project.update',
  'project.delete',
  'project.submit',
  'project.files.read',
  'project.files.create',
  'project.files.complete',
  'project.files.delete',
  'job.review',
  'job.approve',
  'job.reject',
  'job.deliver',
  'deliverable.download',
  'admin.users',
  'admin.projects',
  'admin.jobs',
  'admin.pricing',
  'admin.subscriptions',
  'admin.rulepacks',
  'admin.audit',
  'admin.jobs.assign',
  'admin.accuracy',
  'accuracy.claim.create',
  'accuracy.claim.list',
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];

export interface PolicyUser {
  id: string;
  role: 'customer' | 'reviewer' | 'admin';
}

export interface PolicyResource {
  ownerId?: string;
  projectId?: string;
  jobId?: string;
  reviewerId?: string;
}

export function can(
  user: PolicyUser | undefined,
  action: PolicyAction,
  resource?: PolicyResource,
): boolean {
  if (user === undefined) {
    return false;
  }
  if (action.startsWith('auth.')) {
    return true;
  }
  if (user.role === 'admin') {
    return (
      action.startsWith('admin.') ||
      action.startsWith('deliverable.') ||
      action === 'job.deliver' ||
      action === 'accuracy.claim.list'
    );
  }
  if (user.role === 'reviewer') {
    if (
      action === 'job.review' ||
      action === 'job.approve' ||
      action === 'job.reject' ||
      action === 'job.deliver'
    ) {
      return resource?.reviewerId === user.id;
    }
    return false;
  }
  if (action === 'deliverable.download') {
    return true;
  }
  if (action === 'project.list' || action === 'project.create') {
    return true;
  }
  if (action === 'accuracy.claim.create' || action === 'accuracy.claim.list') {
    return true;
  }
  if (action.startsWith('project.')) {
    return resource?.ownerId === user.id;
  }
  return false;
}

const REVIEWER_JOB_ACTIONS: ReadonlySet<PolicyAction> = new Set<PolicyAction>([
  'job.review',
  'job.approve',
  'job.reject',
  'job.deliver',
]);

export function requirePolicy(action: PolicyAction, resource?: PolicyResource): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    const resolved: PolicyResource = { ...(resource ?? {}) };
    if (typeof req.params.ownerId === 'string') {
      resolved.ownerId = req.params.ownerId;
    }
    if (typeof req.params.projectId === 'string') {
      resolved.projectId = req.params.projectId;
    }
    if (typeof req.params.jobId === 'string') {
      resolved.jobId = req.params.jobId;
    }
    if (typeof req.params.reviewerId === 'string') {
      resolved.reviewerId = req.params.reviewerId;
    }
    if (
      user !== undefined &&
      REVIEWER_JOB_ACTIONS.has(action) &&
      resolved.reviewerId === undefined
    ) {
      resolved.reviewerId = user.id;
    }
    if (!can(user, action, resolved)) {
      next(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
      return;
    }
    next();
  };
}
