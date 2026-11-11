import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../errors/ApiError';
import { loadEnv } from '../config/env';
import { getSessionUser, logout, type PublicUser } from '../modules/auth/auth.service';

declare module 'express-serve-static-core' {
  interface Request {
    user?: PublicUser;
  }
}

const SESSION_COOKIE_NAME = 'takeoff_session';

function extractSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      const separatorIndex = trimmed.indexOf('=');
      const name = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
      const value = separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 1);
      if (name === SESSION_COOKIE_NAME && value.length > 0) {
        return value;
      }
    }
  }
  const headerToken = req.headers['x-session-token'];
  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }
  return undefined;
}

export function createAuthenticate(): RequestHandler {
  const handler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = extractSessionToken(req);
    if (token === undefined) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Session token required'));
      return;
    }
    try {
      const user = await getSessionUser(token);
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
  return handler;
}

export const authenticate = createAuthenticate();

export function createLogoutHandler(): RequestHandler {
  const handler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractSessionToken(req);
    if (token === undefined) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Session token required'));
      return;
    }
    try {
      await logout(token);
      const env = loadEnv();
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        ...(env.COOKIE_DOMAIN === undefined || env.COOKIE_DOMAIN.length === 0
          ? {}
          : { domain: env.COOKIE_DOMAIN }),
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  };
  return handler;
}
