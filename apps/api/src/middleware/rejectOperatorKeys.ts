import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../errors/ApiError';

const MAX_DEPTH = 12;

function findOperatorKey(value: unknown, depth = 0): string | undefined {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOperatorKey(item, depth + 1);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      return key;
    }
    const found = findOperatorKey(child, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * Rejects MongoDB operator and dotted-path keys anywhere in the request body,
 * query string or route params. Zod strict schemas already reject unknown
 * fields; this is defence in depth against query-parser object injection.
 */
export const rejectOperatorKeys: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const key =
    findOperatorKey(req.body) ?? findOperatorKey(req.query) ?? findOperatorKey(req.params);
  if (key !== undefined) {
    next(new ApiError(400, 'VALIDATION_FAILED', 'Invalid request key', [{ path: key }]));
    return;
  }
  next();
};
