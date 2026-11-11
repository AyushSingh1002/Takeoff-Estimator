import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorCode, ErrorDetail, ErrorEnvelopeBody } from '@takeoff/shared';
import { ApiError } from '../errors/ApiError';
import { contextLogger } from './logger';

interface MappedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

export function mapError(error: unknown): MappedError {
  if (error instanceof ApiError) {
    const mapped: MappedError = {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) {
      mapped.details = error.details;
    }
    return mapped;
  }
  if (error instanceof ZodError) {
    const mapped: MappedError = {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
    };
    mapped.details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      issue: issue.code,
    }));
    return mapped;
  }
  const mapped: MappedError = {
    statusCode: 500,
    code: 'INTERNAL',
    message: 'Internal server error',
  };
  return mapped;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const mapped = mapError(error);
  const body: ErrorEnvelopeBody = {
    code: mapped.code,
    message: mapped.message,
    ...(mapped.details === undefined ? {} : { details: mapped.details }),
    requestId: req.requestId,
  };
  contextLogger().error({ err: error, code: mapped.code, requestId: req.requestId }, 'error');
  res.status(mapped.statusCode).json({ error: body });
};
