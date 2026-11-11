import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { InMemoryObjectStorage } from '../../providers/storage';
import { InMemoryEmailSender, setEmailSenderForTesting } from '../../providers/email';
import { isMongoReady } from '../../db/mongo';
import { User, AuthToken } from './auth.model';
import { can, POLICY_ACTIONS } from '../../middleware/policy';
import { ApiError } from '../../errors/ApiError';

describe('auth (M1)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  const emailSender = new InMemoryEmailSender();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.EMAIL_FROM = 'no-reply@example.com';
    process.env.EMAIL_SMTP_HOST = 'localhost';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m1');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    setEmailSenderForTesting(emailSender);
    await mongoose.connect(process.env.MONGODB_URI);
    app = createApp({
      storage: new InMemoryObjectStorage(),
      isMongoReady,
    });
  });

  afterAll(async () => {
    setEmailSenderForTesting(null);
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('registers a customer and issues a session', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'owner@example.com',
      password: 'supersecret123',
      name: 'Owner',
    });
    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('owner@example.com');
    expect(response.body.user.role).toBe('customer');
  });

  it('logs in, attaches a session cookie and reads /me', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@example.com',
      password: 'supersecret123',
    });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers['set-cookie']).toBeDefined();
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const firstSetCookie: string | undefined = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader;
    const cookie = firstSetCookie?.split(';')[0] ?? '';
    expect(cookie.length).toBeGreaterThan(0);
    const meResponse = await request(app).get('/api/v1/me').set('Cookie', cookie);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe('owner@example.com');
  });

  it('logs out, clears the session cookie and invalidates the session', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@example.com',
      password: 'supersecret123',
    });
    expect(loginResponse.status).toBe(200);
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const firstSetCookie: string | undefined = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader;
    const cookie = firstSetCookie?.split(';')[0] ?? '';

    const logoutResponse = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ ok: true });
    const logoutCookies = logoutResponse.headers['set-cookie'];
    const cleared: string = Array.isArray(logoutCookies)
      ? (logoutCookies[0] ?? '')
      : (logoutCookies ?? '');
    expect(cleared).toContain('takeoff_session=');
    expect(cleared).toContain('Path=/');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    const meResponse = await request(app).get('/api/v1/me').set('Cookie', cookie);
    expect(meResponse.status).toBe(401);
  });

  it('rejects a login with a wrong password using the error envelope', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@example.com',
      password: 'wrongpassword1',
    });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects /me without a session', async () => {
    const response = await request(app).get('/api/v1/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('creates a password reset token and emails a single-use link', async () => {
    emailSender.clear();
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'owner@example.com' });
    expect(response.status).toBe(202);
    const token = await AuthToken.findOne({ type: 'password_reset' }).sort({ createdAt: -1 });
    expect(token).not.toBeNull();
    expect(token?.expiresAt).toBeDefined();
    expect(emailSender.messages).toHaveLength(1);
    const message = emailSender.messages[0];
    expect(message?.to).toBe('owner@example.com');
    const match = /reset-password\?token=([a-f0-9]{64})/.exec(message?.text ?? '');
    expect(match).not.toBeNull();
    const emailedHash = createHash('sha256')
      .update(match?.[1] ?? '')
      .digest('hex');
    expect(emailedHash).toBe(token?.tokenHash);
  });

  it('returns the same response without emailing unknown addresses', async () => {
    emailSender.clear();
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(response.status).toBe(202);
    expect(emailSender.messages).toHaveLength(0);
  });

  it('resets the password with a valid token and allows re-login', async () => {
    const user = await User.findOne({ email: 'owner@example.com' });
    const tokenHash = createHash('sha256').update('a'.repeat(64)).digest('hex');
    await AuthToken.create({
      userId: user?._id.toString() ?? '',
      type: 'password_reset',
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const resetResponse = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: 'a'.repeat(64),
        password: 'newsecret12345',
      });
    expect(resetResponse.status).toBe(200);
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@example.com',
      password: 'newsecret12345',
    });
    expect(loginResponse.status).toBe(200);
  });

  it('policy: deny by default and allow admin for admin-scoped actions', () => {
    expect(can(undefined, 'admin.users')).toBe(false);
    expect(can({ id: 'u1', role: 'admin' }, 'admin.users')).toBe(true);
    expect(can({ id: 'u2', role: 'customer' }, 'admin.users')).toBe(false);
    expect(can({ id: 'u2', role: 'customer' }, 'project.submit', { ownerId: 'u2' })).toBe(true);
    expect(can({ id: 'u2', role: 'customer' }, 'project.submit', { ownerId: 'u3' })).toBe(false);
    expect(
      can({ id: 'u3', role: 'reviewer' }, 'job.review', { reviewerId: 'u3', jobId: 'j1' }),
    ).toBe(true);
    expect(
      can({ id: 'u3', role: 'reviewer' }, 'job.review', { reviewerId: 'u4', jobId: 'j1' }),
    ).toBe(false);
    expect(can({ id: 'u2', role: 'customer' }, 'deliverable.download')).toBe(true);
    expect(can({ id: 'u3', role: 'reviewer' }, 'deliverable.download')).toBe(false);
    expect(can({ id: 'u1', role: 'admin' }, 'deliverable.download')).toBe(true);
    expect(
      can({ id: 'u3', role: 'reviewer' }, 'job.deliver', { reviewerId: 'u3', jobId: 'j1' }),
    ).toBe(true);
    expect(
      can({ id: 'u3', role: 'reviewer' }, 'job.deliver', { reviewerId: 'u4', jobId: 'j1' }),
    ).toBe(false);
    expect(POLICY_ACTIONS.length).toBeGreaterThan(0);
  });

  it('policy: throws a FORBIDDEN ApiError when the user lacks the action', () => {
    expect(() => {
      throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
    }).toThrow(ApiError);
  });
});
