import type { Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorDetail } from '@takeoff/shared';
import { ApiError } from '../../errors/ApiError';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { ObjectStorage } from '../../providers/storage';
import { updateSheetBodySchema, type UpdateSheetInput } from './project.schemas';
import { getSheetImage, listSheets, updateSheet } from './sheet.service';

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), issue: issue.code }));
}

function requireUser(req: Request): string {
  const user = req.user;
  if (user === undefined) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session token required');
  }
  return user.id;
}

function requireParam(req: Request, key: string): string {
  const value = req.params[key];
  if (typeof value !== 'string') {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  return value;
}

export function createListSheetsHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const sheets = await listSheets(requireUser(req), requireParam(req, 'id'));
    res.json({ sheets });
  });
}

export function createUpdateSheetHandler(): RequestHandler {
  return asyncHandler(async (req, res) => {
    const parsed = updateSheetBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const sheet = await updateSheet(
      requireUser(req),
      requireParam(req, 'id'),
      requireParam(req, 'sheetId'),
      parsed.data as UpdateSheetInput,
    );
    res.json({ sheet });
  });
}

export function createGetSheetImageHandler(storage: ObjectStorage): RequestHandler {
  return asyncHandler(async (req, res) => {
    const image = await getSheetImage(
      storage,
      requireUser(req),
      requireParam(req, 'id'),
      requireParam(req, 'sheetId'),
    );
    res.json(image);
  });
}
