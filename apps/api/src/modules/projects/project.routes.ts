import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import { uploadRateLimiter } from '../../middleware/rateLimit';
import { ObjectStorage } from '../../providers/storage';
import {
  createCreateProjectHandler,
  createCreateUploadHandler,
  createCompleteUploadHandler,
  createDeleteProjectHandler,
  createDeleteUploadHandler,
  createGetProjectHandler,
  createGetProjectStatusHandler,
  createListFilesHandler,
  createListProjectsHandler,
  createSubmitProjectHandler,
  createUpdateProjectHandler,
} from './project.controller';
import {
  createGetSheetImageHandler,
  createListSheetsHandler,
  createUpdateSheetHandler,
} from './sheet.controller';

export function createProjectsRouter(deps: { storage: ObjectStorage }): Router {
  const router = Router();

  router.get(
    '/projects',
    authenticate,
    requirePolicy('project.list'),
    asyncHandler(createListProjectsHandler()),
  );
  router.post(
    '/projects',
    authenticate,
    requirePolicy('project.create'),
    asyncHandler(createCreateProjectHandler()),
  );
  router.get('/projects/:id', authenticate, asyncHandler(createGetProjectHandler()));
  router.patch('/projects/:id', authenticate, asyncHandler(createUpdateProjectHandler()));
  router.delete('/projects/:id', authenticate, asyncHandler(createDeleteProjectHandler()));
  router.get('/projects/:id/files', authenticate, asyncHandler(createListFilesHandler()));
  router.post(
    '/projects/:id/files',
    authenticate,
    uploadRateLimiter,
    asyncHandler(createCreateUploadHandler(deps.storage)),
  );
  router.post(
    '/projects/:id/files/:fileId/complete',
    authenticate,
    asyncHandler(createCompleteUploadHandler(deps.storage)),
  );
  router.delete(
    '/projects/:id/files/:fileId',
    authenticate,
    asyncHandler(createDeleteUploadHandler(deps.storage)),
  );

  router.get('/projects/:id/sheets', authenticate, asyncHandler(createListSheetsHandler()));
  router.patch(
    '/projects/:id/sheets/:sheetId',
    authenticate,
    asyncHandler(createUpdateSheetHandler()),
  );
  router.get(
    '/projects/:id/sheets/:sheetId/image',
    authenticate,
    asyncHandler(createGetSheetImageHandler(deps.storage)),
  );

  router.post('/projects/:id/submit', authenticate, asyncHandler(createSubmitProjectHandler()));
  router.get('/projects/:id/status', authenticate, asyncHandler(createGetProjectStatusHandler()));

  return router;
}
