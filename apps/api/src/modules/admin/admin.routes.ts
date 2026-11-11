import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import {
  createApproveRulePackHandler,
  createAssignJobHandler,
  createCancelJobHandler,
  createCreateRulePackHandler,
  createListAuditLogsHandler,
  createListJobsHandler,
  createListProjectsHandler,
  createListRulePacksHandler,
  createListUsersHandler,
  createRetireRulePackHandler,
  createRerunJobHandler,
  createRetryJobHandler,
  createUpdateUserHandler,
} from './admin.controller';

export function createAdminRouter(): Router {
  const router = Router();

  router.get(
    '/admin/users',
    authenticate,
    requirePolicy('admin.users'),
    asyncHandler(createListUsersHandler()),
  );
  router.patch(
    '/admin/users/:id',
    authenticate,
    requirePolicy('admin.users'),
    asyncHandler(createUpdateUserHandler()),
  );
  router.get(
    '/admin/projects',
    authenticate,
    requirePolicy('admin.projects'),
    asyncHandler(createListProjectsHandler()),
  );
  router.get(
    '/admin/jobs',
    authenticate,
    requirePolicy('admin.jobs'),
    asyncHandler(createListJobsHandler()),
  );
  router.post(
    '/admin/jobs/:id/assign',
    authenticate,
    requirePolicy('admin.jobs'),
    asyncHandler(createAssignJobHandler()),
  );
  router.post(
    '/admin/jobs/:id/retry',
    authenticate,
    requirePolicy('admin.jobs'),
    asyncHandler(createRetryJobHandler()),
  );
  router.post(
    '/admin/jobs/:id/rerun',
    authenticate,
    requirePolicy('admin.jobs'),
    asyncHandler(createRerunJobHandler()),
  );
  router.post(
    '/admin/jobs/:id/cancel',
    authenticate,
    requirePolicy('admin.jobs'),
    asyncHandler(createCancelJobHandler()),
  );
  router.get(
    '/admin/rule-packs',
    authenticate,
    requirePolicy('admin.rulepacks'),
    asyncHandler(createListRulePacksHandler()),
  );
  router.post(
    '/admin/rule-packs',
    authenticate,
    requirePolicy('admin.rulepacks'),
    asyncHandler(createCreateRulePackHandler()),
  );
  router.post(
    '/admin/rule-packs/:id/approve',
    authenticate,
    requirePolicy('admin.rulepacks'),
    asyncHandler(createApproveRulePackHandler()),
  );
  router.post(
    '/admin/rule-packs/:id/retire',
    authenticate,
    requirePolicy('admin.rulepacks'),
    asyncHandler(createRetireRulePackHandler()),
  );
  router.get(
    '/admin/audit-logs',
    authenticate,
    requirePolicy('admin.audit'),
    asyncHandler(createListAuditLogsHandler()),
  );

  return router;
}
