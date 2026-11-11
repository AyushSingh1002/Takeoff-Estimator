import type { Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../../errors/ApiError';
import { type ErrorDetail } from '@takeoff/shared';
import { asyncHandler } from '../../middleware/asyncHandler';
import { loadEnv } from '../../config/env';
import {
  changePassword,
  forgotPassword,
  login,
  register,
  resetPassword,
  updateProfile,
} from './auth.service';
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  updateProfileBodySchema,
  type ChangePasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
} from './auth.schemas';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    issue: issue.code,
  }));
}

function setSessionCookie(res: Response, token: string): void {
  const env = loadEnv();
  res.cookie('takeoff_session', token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
    ...(env.COOKIE_DOMAIN === undefined || env.COOKIE_DOMAIN.length === 0
      ? {}
      : { domain: env.COOKIE_DOMAIN }),
  });
}

export const registerHandler: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Validation failed', toErrorDetails(parsed.error));
  }
  const { user, token } = await register(parsed.data);
  setSessionCookie(res, token);
  res.status(201).json({ user });
});

export const loginHandler: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Validation failed', toErrorDetails(parsed.error));
  }
  const { user, token } = await login(parsed.data as LoginInput);
  setSessionCookie(res, token);
  res.json({ user });
});

export const forgotPasswordHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = forgotPasswordBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    await forgotPassword(parsed.data.email);
    res.status(202).json({ ok: true });
  },
);

export const resetPasswordHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = resetPasswordBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    await resetPassword(parsed.data as ResetPasswordInput);
    res.json({ ok: true });
  },
);

export const getMeHandler: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (user === undefined) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session token required');
  }
  res.json({ user });
});

export const updateProfileHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user;
    if (user === undefined) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Session token required');
    }
    const parsed = updateProfileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const userResult = await updateProfile(user.id, parsed.data as UpdateProfileInput);
    res.json({ user: userResult });
  },
);

export const changePasswordHandler: RequestHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user;
    if (user === undefined) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Session token required');
    }
    const parsed = changePasswordBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        toErrorDetails(parsed.error),
      );
    }
    const input = parsed.data as ChangePasswordInput;
    await changePassword(user.id, input);
    res.json({ ok: true });
  },
);
