import { createHash, randomBytes } from 'crypto';
import argon2 from 'argon2';
import { ApiError } from '../../errors/ApiError';
import type { HydratedDocument } from 'mongoose';
import { writeAudit } from '../audit/audit.service';
import { loadEnv } from '../../config/env';
import { logger } from '../../middleware/logger';
import { getEmailSender } from '../../providers/email';
import { User, AuthToken, type AuthTokenAttrs, type UserAttrs, type UserRole } from './auth.model';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from './auth.schemas';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const TOKEN_BYTES = 32;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  company?: string;
  role: UserRole;
  isActive: boolean;
  freeTrialUsedAt?: Date;
  lastLoginAt?: Date;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const authToken: AuthTokenAttrs = {
    userId,
    type: 'session',
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  };
  await AuthToken.create(authToken);
  return token;
}

type UserDoc = HydratedDocument<UserAttrs>;

function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    ...(user.company === undefined ? {} : { company: user.company }),
    role: user.role,
    isActive: user.isActive,
    ...(user.freeTrialUsedAt === undefined ? {} : { freeTrialUsedAt: user.freeTrialUsedAt }),
    ...(user.lastLoginAt === undefined ? {} : { lastLoginAt: user.lastLoginAt }),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email });
  if (existing !== null) {
    throw new ApiError(409, 'CONFLICT', 'Email already registered');
  }
  const user = await User.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    name: input.name,
    company: input.company,
    role: 'customer',
    isActive: true,
  });
  const token = await createSession(user._id.toString());
  return { user: toPublicUser(user), token };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email });
  if (user === null) {
    await writeAudit({
      actorRole: 'anonymous',
      action: 'auth.login.failed',
      entityType: 'User',
      entityId: 'unknown',
      after: { reason: 'unknown_email' },
    });
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid email or password');
  }
  const now = Date.now();
  if (user.lockedUntil !== undefined && user.lockedUntil.getTime() > now) {
    await writeAudit({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.login.blocked',
      entityType: 'User',
      entityId: user._id.toString(),
      after: { lockedUntil: user.lockedUntil },
    });
    throw new ApiError(429, 'RATE_LIMITED', 'Account temporarily locked. Try again later.');
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const failedLoginCount = (user.failedLoginCount ?? 0) + 1;
    user.failedLoginCount = failedLoginCount;
    const locked = failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS;
    if (locked) {
      user.lockedUntil = new Date(now + LOGIN_LOCKOUT_MS);
      user.failedLoginCount = 0;
    }
    await user.save();
    await writeAudit({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: locked ? 'auth.login.locked' : 'auth.login.failed',
      entityType: 'User',
      entityId: user._id.toString(),
      after: {
        failedLoginCount,
        ...(user.lockedUntil === undefined ? {} : { lockedUntil: user.lockedUntil }),
      },
    });
    if (locked) {
      throw new ApiError(429, 'RATE_LIMITED', 'Account temporarily locked. Try again later.');
    }
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid email or password');
  }
  if (user.isActive === false) {
    await writeAudit({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: 'auth.login.failed',
      entityType: 'User',
      entityId: user._id.toString(),
      after: { reason: 'inactive' },
    });
    throw new ApiError(401, 'UNAUTHENTICATED', 'Account is inactive');
  }
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  const token = await createSession(user._id.toString());
  await writeAudit({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: 'auth.login.success',
    entityType: 'User',
    entityId: user._id.toString(),
  });
  return { user: toPublicUser(user), token };
}

export async function logout(token: string): Promise<void> {
  const authToken = await AuthToken.findOne({ tokenHash: sha256(token), type: 'session' });
  if (authToken === null) {
    return;
  }
  authToken.revokedAt = new Date();
  await authToken.save();
  await writeAudit({
    actorId: authToken.userId,
    actorRole: 'user',
    action: 'auth.logout',
    entityType: 'AuthToken',
    entityId: authToken._id.toString(),
  });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (user === null) {
    return;
  }
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const authToken: AuthTokenAttrs = {
    userId: user._id.toString(),
    type: 'password_reset',
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
  await AuthToken.create(authToken);
  await sendPasswordResetEmail(user.email, token);
}

async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const env = loadEnv();
  const resetUrl = `${env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await getEmailSender(env).send({
      to,
      subject: 'Reset your Takeoff Estimator password',
      text:
        'Use the link below to choose a new password. It expires in 60 minutes and can be used once.\n\n' +
        `${resetUrl}\n\n` +
        'If you did not request a password reset, you can ignore this email.',
    });
  } catch (error: unknown) {
    // The endpoint must stay uniform for known and unknown addresses, so the
    // caller still returns 202; the failure is logged for operators instead.
    logger.error({ err: error }, 'password_reset_email_failed');
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const authToken = await AuthToken.findOne({
    tokenHash: sha256(input.token),
    type: 'password_reset',
  });
  const invalid = new ApiError(400, 'CONFLICT', 'Invalid or expired reset token');
  if (authToken === null || authToken.revokedAt !== undefined || authToken.usedAt !== undefined) {
    throw invalid;
  }
  if (authToken.expiresAt.getTime() < Date.now()) {
    throw invalid;
  }
  const user = await User.findById(authToken.userId);
  if (user === null) {
    throw invalid;
  }
  user.passwordHash = await hashPassword(input.password);
  await user.save();
  authToken.usedAt = new Date();
  await authToken.save();
  await AuthToken.updateMany(
    { userId: authToken.userId, type: 'session', revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await User.findById(userId);
  if (user === null) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiError(403, 'FORBIDDEN', 'Current password is incorrect');
  }
  user.passwordHash = await hashPassword(input.newPassword);
  await user.save();
  await AuthToken.updateMany(
    { userId: user._id.toString(), type: 'session', revokedAt: { $exists: false } },
    { revokedAt: new Date() },
  );
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (user === null) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  if (input.name !== undefined) {
    user.name = input.name;
  }
  if (input.company !== undefined) {
    user.company = input.company;
  }
  await user.save();
  return toPublicUser(user);
}

export async function getSessionUser(token: string): Promise<PublicUser> {
  const authToken = await AuthToken.findOne({ tokenHash: sha256(token), type: 'session' });
  const invalid = new ApiError(401, 'UNAUTHENTICATED', 'Session not found, expired or revoked');
  if (authToken === null) {
    throw invalid;
  }
  if (authToken.revokedAt !== undefined || authToken.usedAt !== undefined) {
    throw invalid;
  }
  if (authToken.expiresAt.getTime() < Date.now()) {
    throw invalid;
  }
  const user = await User.findById(authToken.userId);
  if (user === null || user.isActive === false) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Account is inactive');
  }
  return toPublicUser(user);
}
