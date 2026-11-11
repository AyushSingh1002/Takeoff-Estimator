import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate, createLogoutHandler } from '../../middleware/auth';
import { requirePolicy } from '../../middleware/policy';
import { authRateLimiter } from '../../middleware/rateLimit';
import {
  changePasswordHandler,
  forgotPasswordHandler,
  getMeHandler,
  loginHandler,
  registerHandler,
  resetPasswordHandler,
  updateProfileHandler,
} from './auth.controller';

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/auth/register', authRateLimiter, asyncHandler(registerHandler));
  router.post('/auth/login', authRateLimiter, asyncHandler(loginHandler));
  router.post('/auth/logout', authRateLimiter, createLogoutHandler());
  router.post('/auth/forgot-password', authRateLimiter, asyncHandler(forgotPasswordHandler));
  router.post('/auth/reset-password', authRateLimiter, asyncHandler(resetPasswordHandler));
  router.get('/me', authenticate, requirePolicy('auth.profile.read'), asyncHandler(getMeHandler));
  router.patch(
    '/me',
    authenticate,
    requirePolicy('auth.profile.update'),
    asyncHandler(updateProfileHandler),
  );
  router.post(
    '/me/password',
    authenticate,
    requirePolicy('auth.password.change'),
    asyncHandler(changePasswordHandler),
  );

  return router;
}
