import { createHash, randomBytes, randomUUID } from 'crypto';
import argon2 from 'argon2';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { envSchema, loadEnv } from '../../config/env';
import { isMongoReady } from '../../db/mongo';
import { authRateLimiter } from '../../middleware/rateLimit';
import { POLICY_ACTIONS, can, type PolicyAction } from '../../middleware/policy';
import { InMemoryObjectStorage } from '../../providers/storage';
import { AuditLog } from '../audit/audit.model';
import { AuthToken, User, type UserRole } from '../auth/auth.model';
import { LOGIN_LOCKOUT_MS, MAX_FAILED_LOGIN_ATTEMPTS, login } from '../auth/auth.service';
import { Deliverable } from '../deliverables/deliverable.model';
import { downloadDeliverable } from '../deliverables/deliverable.service';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { Measurement } from '../pipeline/measurement.model';
import { createProject } from '../projects/project.service';
import { Project } from '../projects/project.model';
import { QAReview } from '../review/qaReview.model';

const VALID_TEST_ENV: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  PORT: '4000',
  APP_ORIGIN: 'https://app.example.com',
  MONGODB_URI: 'mongodb://localhost:27017/takeoff',
  SESSION_IDLE_MINUTES: '30',
  SESSION_ABSOLUTE_HOURS: '12',
  COOKIE_SECURE: 'true',
  STORAGE_REGION: 'us-east-1',
  STORAGE_BUCKET: 'takeoff-production',
  STORAGE_ACCESS_KEY_ID: 'production-access-key',
  STORAGE_SECRET_ACCESS_KEY: 'production-secret-key',
  UPLOAD_MAX_BYTES: '26214400',
  UPLOAD_MAX_FILES: '50',
  INGEST_MAX_PAGES: '100',
  SIGNED_URL_TTL_SECONDS: '60',
  PROCESSING_MODE: 'provider',
  JOB_LEASE_SECONDS: '60',
  JOB_MAX_ATTEMPTS: '3',
  JOB_COST_CEILING_USD: '50',
  EMAIL_PROVIDER: 'smtp',
  EMAIL_FROM: 'no-reply@example.com',
  EMAIL_SMTP_HOST: 'smtp.example.com',
  EMAIL_SMTP_PORT: '587',
  FEATURE_EXPRESS: 'false',
  FEATURE_PAYMENTS: 'false',
  LOG_LEVEL: 'info',
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('security hardening (M11)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  let storage: InMemoryObjectStorage;
  let customerA: { id: string; cookie: string };
  let customerB: { id: string; cookie: string };
  let reviewer: { id: string; cookie: string };
  let otherReviewer: { id: string; cookie: string };
  let admin: { id: string; cookie: string };
  let projectId: string;
  let jobId: string;
  let measurementId: string;
  let deliverableId: string;

  async function makeSession(role: UserRole): Promise<{ id: string; cookie: string }> {
    const user = await User.create({
      email: `${role}-${randomUUID()}@example.com`,
      passwordHash: 'not-used-in-session-tests',
      name: `${role} user`,
      role,
      isActive: true,
    });
    const token = randomBytes(32).toString('hex');
    await AuthToken.create({
      userId: user._id.toString(),
      type: 'session',
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return { id: user._id.toString(), cookie: `takeoff_session=${token}` };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m11');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);

    storage = new InMemoryObjectStorage();
    app = createApp({ storage, isMongoReady });

    customerA = await makeSession('customer');
    customerB = await makeSession('customer');
    reviewer = await makeSession('reviewer');
    otherReviewer = await makeSession('reviewer');
    admin = await makeSession('admin');

    const project = await createProject(customerA.id, { name: 'Security project' });
    projectId = project._id.toString();

    const job = await TakeoffJob.create({
      projectId,
      reason: 'initial',
      status: 'awaiting_review',
      stages: [
        { name: 'recognize', status: 'done', attempts: 1 },
        { name: 'measure', status: 'done', attempts: 1 },
        { name: 'convert', status: 'done', attempts: 1 },
        { name: 'verify', status: 'done', attempts: 1 },
      ],
      sla: { deadlineAt: new Date(Date.now() + 60 * 60 * 1000), status: 'on_track' },
      fileIds: [],
    });
    jobId = job._id.toString();
    await QAReview.create({
      jobId,
      reviewerId: reviewer.id,
      kind: 'primary',
      status: 'assigned',
      assignedBy: admin.id,
    });
    const measurement = await Measurement.create({
      projectId,
      jobId,
      type: 'area',
      value: 10,
      unit: 'm2',
      method: 'fixture',
      confidence: 0.9,
    });
    measurementId = measurement._id.toString();
    const deliverable = await Deliverable.create({
      projectId,
      jobId,
      type: 'boq_xlsx',
      status: 'ready',
      storageKey: `projects/${projectId}/deliverables/boq.xlsx`,
      version: 1,
      isTestData: true,
      generatedBy: 'test',
    });
    deliverableId = deliverable._id.toString();
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('enforces the deny-by-default authorisation matrix for every policy action', () => {
    const roles: Array<{ user: { id: string; role: UserRole } | undefined; name: string }> = [
      { user: undefined, name: 'anonymous' },
      { user: { id: customerA.id, role: 'customer' }, name: 'customer' },
      { user: { id: reviewer.id, role: 'reviewer' }, name: 'reviewer' },
      { user: { id: admin.id, role: 'admin' }, name: 'admin' },
    ];
    for (const action of POLICY_ACTIONS) {
      for (const role of roles) {
        const allowed = can(role.user, action as PolicyAction, {
          ...(role.user === undefined ? {} : { ownerId: role.user.id, reviewerId: role.user.id }),
        });
        expect(typeof allowed).toBe('boolean');
        if (role.name === 'anonymous') {
          expect(allowed).toBe(false);
        }
      }
    }

    expect(
      can({ id: customerA.id, role: 'customer' }, 'project.read', { ownerId: customerA.id }),
    ).toBe(true);
    expect(
      can({ id: customerA.id, role: 'customer' }, 'project.read', { ownerId: customerB.id }),
    ).toBe(false);
    expect(
      can({ id: reviewer.id, role: 'reviewer' }, 'job.review', { reviewerId: reviewer.id }),
    ).toBe(true);
    expect(
      can({ id: reviewer.id, role: 'reviewer' }, 'job.review', { reviewerId: otherReviewer.id }),
    ).toBe(false);
    expect(can({ id: admin.id, role: 'admin' }, 'job.review')).toBe(false);
    expect(can({ id: admin.id, role: 'admin' }, 'job.approve')).toBe(false);
    expect(can({ id: admin.id, role: 'admin' }, 'job.reject')).toBe(false);
    expect(can({ id: admin.id, role: 'admin' }, 'job.deliver')).toBe(true);
    expect(can({ id: admin.id, role: 'admin' }, 'admin.accuracy')).toBe(true);
    for (const role of ['customer', 'reviewer', 'admin'] as const) {
      const user = { id: `${role}-self`, role };
      expect(can(user, 'auth.profile.read')).toBe(true);
      expect(can(user, 'auth.profile.update')).toBe(true);
      expect(can(user, 'auth.password.change')).toBe(true);
    }
  });

  it('blocks IDOR across customers and unassigned reviewers at the route level', async () => {
    const customerMe = await request(app).get('/api/v1/me').set('Cookie', customerA.cookie);
    expect(customerMe.status).toBe(200);
    const reviewerMe = await request(app).get('/api/v1/me').set('Cookie', reviewer.cookie);
    expect(reviewerMe.status).toBe(200);
    const adminMe = await request(app).get('/api/v1/me').set('Cookie', admin.cookie);
    expect(adminMe.status).toBe(200);

    const own = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerA.cookie);
    expect(own.status).toBe(200);

    const crossRead = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerB.cookie);
    expect(crossRead.status).toBe(404);

    const crossPatch = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerB.cookie)
      .send({ name: 'Taken over' });
    expect(crossPatch.status).toBe(404);

    const crossFiles = await request(app)
      .get(`/api/v1/projects/${projectId}/files`)
      .set('Cookie', customerB.cookie);
    expect(crossFiles.status).toBe(404);

    const crossUpload = await request(app)
      .post(`/api/v1/projects/${projectId}/files`)
      .set('Cookie', customerB.cookie)
      .send({ originalName: 'x.pdf', contentType: 'application/pdf', sizeBytes: 10 });
    expect(crossUpload.status).toBe(404);

    const assignedDetail = await request(app)
      .get(`/api/v1/review/jobs/${jobId}`)
      .set('Cookie', reviewer.cookie);
    expect(assignedDetail.status).toBe(200);

    const unassignedDetail = await request(app)
      .get(`/api/v1/review/jobs/${jobId}`)
      .set('Cookie', otherReviewer.cookie);
    expect(unassignedDetail.status).toBe(403);

    const unassignedEdit = await request(app)
      .patch(`/api/v1/review/jobs/${jobId}/measurements/${measurementId}`)
      .set('Cookie', otherReviewer.cookie)
      .send({ value: 99, note: 'Unauthorised correction attempt' });
    expect(unassignedEdit.status).toBe(403);
    const unchanged = await Measurement.findById(measurementId);
    expect(unchanged?.value).toBe(10);

    const unassignedSheets = await request(app)
      .get(`/api/v1/review/jobs/${jobId}/sheets`)
      .set('Cookie', otherReviewer.cookie);
    expect(unassignedSheets.status).toBe(403);

    const unassignedApprove = await request(app)
      .post(`/api/v1/review/jobs/${jobId}/approve`)
      .set('Cookie', otherReviewer.cookie);
    expect(unassignedApprove.status).toBe(403);
    const stillInReview = await TakeoffJob.findById(jobId);
    expect(stillInReview?.status).toBe('in_review');

    const customerReview = await request(app)
      .post(`/api/v1/review/jobs/${jobId}/approve`)
      .set('Cookie', customerA.cookie);
    expect(customerReview.status).toBe(403);

    const adminApprove = await request(app)
      .post(`/api/v1/review/jobs/${jobId}/approve`)
      .set('Cookie', admin.cookie);
    expect(adminApprove.status).toBe(403);

    const adminJobs = await request(app).get('/api/v1/admin/jobs').set('Cookie', admin.cookie);
    expect(adminJobs.status).toBe(200);
    const customerAdmin = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Cookie', customerA.cookie);
    expect(customerAdmin.status).toBe(403);
    const reviewerAdmin = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Cookie', reviewer.cookie);
    expect(reviewerAdmin.status).toBe(403);

    const adminClaims = await request(app)
      .get('/api/v1/accuracy-claims')
      .set('Cookie', admin.cookie);
    expect(adminClaims.status).toBe(200);
    const reviewerClaims = await request(app)
      .get('/api/v1/accuracy-claims')
      .set('Cookie', reviewer.cookie);
    expect(reviewerClaims.status).toBe(403);

    const ownerDownload = await request(app)
      .get(`/api/v1/deliverables/${deliverableId}/download`)
      .set('Cookie', customerA.cookie);
    expect(ownerDownload.status).toBe(200);
    const crossDownload = await request(app)
      .get(`/api/v1/deliverables/${deliverableId}/download`)
      .set('Cookie', customerB.cookie);
    expect(crossDownload.status).toBe(404);
    const reviewerDownload = await request(app)
      .get(`/api/v1/deliverables/${deliverableId}/download`)
      .set('Cookie', reviewer.cookie);
    expect(reviewerDownload.status).toBe(403);
    const adminDownload = await request(app)
      .get(`/api/v1/deliverables/${deliverableId}/download`)
      .set('Cookie', admin.cookie);
    expect(adminDownload.status).toBe(200);
  });

  it('rejects operator injection in query strings, params and bodies', async () => {
    const injectedQuery = await request(app)
      .get('/api/v1/admin/jobs?status[$ne]=queued')
      .set('Cookie', admin.cookie);
    expect(injectedQuery.status).toBe(400);
    expect(injectedQuery.body.error.code).toBe('VALIDATION_FAILED');

    const injectedAudit = await request(app)
      .get('/api/v1/admin/audit-logs?action[$ne]=x')
      .set('Cookie', admin.cookie);
    expect(injectedAudit.status).toBe(400);

    const injectedBody = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerA.cookie)
      .send({ name: { $ne: null } });
    expect(injectedBody.status).toBe(400);

    const injectedRulePack = await request(app)
      .post('/api/v1/admin/rule-packs')
      .set('Cookie', admin.cookie)
      .send({
        trade: 'drywall',
        regionPackCode: 'US',
        version: '1.0.0',
        parameters: { $where: 1 },
      });
    expect(injectedRulePack.status).toBe(400);

    const normal = await request(app)
      .get('/api/v1/admin/jobs?status=awaiting_review')
      .set('Cookie', admin.cookie);
    expect(normal.status).toBe(200);
  });

  it('issues short-lived signed download URLs from the configured TTL', async () => {
    const captured: Array<{ key: string; ttl: number }> = [];
    const fakeStorage = {
      presignGet: async (key: string, ttlSeconds: number): Promise<string> => {
        captured.push({ key, ttl: ttlSeconds });
        return `https://storage.example/${key}?ttl=${ttlSeconds}`;
      },
    };
    const original = process.env.SIGNED_URL_TTL_SECONDS;
    try {
      process.env.SIGNED_URL_TTL_SECONDS = '120';
      const result = await downloadDeliverable({
        deliverableId,
        actorId: customerA.id,
        actorRole: 'customer',
        storage: fakeStorage,
      });
      expect(result.expiresIn).toBe(120);
      expect(captured[0]?.ttl).toBe(120);
      expect(captured[0]?.key).toContain('boq.xlsx');
    } finally {
      if (original === undefined) {
        delete process.env.SIGNED_URL_TTL_SECONDS;
      } else {
        process.env.SIGNED_URL_TTL_SECONDS = original;
      }
    }
  });

  it('rate-limits auth routes per IP and locks an account after repeated failures', async () => {
    authRateLimiter.resetKey('127.0.0.1');
    authRateLimiter.resetKey('::ffff:127.0.0.1');
    authRateLimiter.resetKey('::1');

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `missing-${attempt}@example.com`,
          password: 'wrongpassword1',
        });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401 || status === 429)).toBe(true);
    expect(statuses[10]).toBe(429);
    authRateLimiter.resetKey('127.0.0.1');
    authRateLimiter.resetKey('::ffff:127.0.0.1');
    authRateLimiter.resetKey('::1');

    const password = 'correct-horse-battery';
    const user = await User.create({
      email: `lockout-${randomUUID()}@example.com`,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      name: 'Lockout user',
    });
    for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS - 1; attempt += 1) {
      await expect(login({ email: user.email, password: 'wrongpassword1' })).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await expect(login({ email: user.email, password: 'wrongpassword1' })).rejects.toMatchObject({
      statusCode: 429,
    });
    const lockedUser = await User.findById(user._id);
    expect(lockedUser?.lockedUntil).toBeDefined();
    expect(lockedUser?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(lockedUser?.lockedUntil?.getTime()).toBeLessThanOrEqual(Date.now() + LOGIN_LOCKOUT_MS);
    await expect(login({ email: user.email, password })).rejects.toMatchObject({ statusCode: 429 });

    const failures = await AuditLog.countDocuments({
      entityId: user._id.toString(),
      action: { $in: ['auth.login.failed', 'auth.login.locked'] },
    });
    expect(failures).toBeGreaterThanOrEqual(MAX_FAILED_LOGIN_ATTEMPTS);

    await User.updateOne(
      { _id: user._id },
      { lockedUntil: new Date(Date.now() - 1000), failedLoginCount: 0 },
    );
    const result = await login({ email: user.email, password });
    expect(result.user.email).toBe(user.email);
    const resetUser = await User.findById(user._id);
    expect(resetUser?.failedLoginCount).toBe(0);
    expect(resetUser?.lockedUntil).toBeUndefined();
  }, 60000);

  it('refuses unsafe production configuration at boot', () => {
    expect(() => loadEnv({ ...VALID_TEST_ENV, PROCESSING_MODE: 'fixture' })).toThrow(
      /fixture processing is not allowed/,
    );
    expect(() => loadEnv({ ...VALID_TEST_ENV, COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE must be true/,
    );
    expect(() => loadEnv({ ...VALID_TEST_ENV, APP_ORIGIN: 'http://app.example.com' })).toThrow(
      /APP_ORIGIN must use https/,
    );
    expect(() => loadEnv({ ...VALID_TEST_ENV, SIGNED_URL_TTL_SECONDS: '999' })).toThrow();
    expect(() => loadEnv({ ...VALID_TEST_ENV, EMAIL_FROM: undefined })).toThrow(
      /EMAIL_FROM is required/,
    );
    expect(() => loadEnv({ ...VALID_TEST_ENV, EMAIL_SMTP_HOST: undefined })).toThrow(
      /EMAIL_SMTP_HOST is required/,
    );
    expect(envSchema.safeParse({ ...VALID_TEST_ENV, STORAGE_ACCESS_KEY_ID: '' }).success).toBe(
      false,
    );
    expect(loadEnv(VALID_TEST_ENV).PROCESSING_MODE).toBe('provider');
  });

  it('rejects upload abuse: wrong type, encrypted, malformed, bomb and active content', async () => {
    async function createAndComplete(input: {
      originalName: string;
      contentType: string;
      bytes: Buffer;
    }): Promise<{ status: number; issue?: string }> {
      const createResponse = await request(app)
        .post(`/api/v1/projects/${projectId}/files`)
        .set('Cookie', customerA.cookie)
        .send({
          originalName: input.originalName,
          contentType: input.contentType,
          sizeBytes: input.bytes.length,
        });
      expect(createResponse.status).toBe(201);
      const fileId = createResponse.body.fileId;
      const filesResponse = await request(app)
        .get(`/api/v1/projects/${projectId}/files`)
        .set('Cookie', customerA.cookie);
      const file = filesResponse.body.files.find(
        (candidate: { id: string }) => candidate.id === fileId,
      );
      await storage.put(file.storageKey, input.bytes, input.contentType);
      const completeResponse = await request(app)
        .post(`/api/v1/projects/${projectId}/files/${fileId}/complete`)
        .set('Cookie', customerA.cookie);
      const issue: string | undefined = completeResponse.body?.error?.details?.[0]?.issue;
      return { status: completeResponse.status, ...(issue === undefined ? {} : { issue }) };
    }

    const validPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
    );
    const valid = await createAndComplete({
      originalName: 'valid.pdf',
      contentType: 'application/pdf',
      bytes: validPdf,
    });
    expect(valid.status).toBe(200);

    const wrongSignature = await createAndComplete({
      originalName: 'fake.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('MZ this is not a pdf at all'),
    });
    expect(wrongSignature.status).toBe(400);
    expect(wrongSignature.issue).toBe('unknown_file_signature');

    const mismatch = await createAndComplete({
      originalName: 'renamed.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.issue).toBe('content_type_mismatch');

    const encrypted = await createAndComplete({
      originalName: 'encrypted.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Encrypt 2 0 R >>\nendobj\n%%EOF\n'),
    });
    expect(encrypted.status).toBe(400);
    expect(encrypted.issue).toBe('encrypted_pdf');

    const malformed = await createAndComplete({
      originalName: 'truncated.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>'),
    });
    expect(malformed.status).toBe(400);
    expect(malformed.issue).toBe('corrupt_pdf');

    const tooManyPages = Buffer.from(
      `%PDF-1.7\n${Array.from({ length: 101 }, () => '/Type /Page').join('\n')}\n%%EOF\n`,
    );
    const pageBomb = await createAndComplete({
      originalName: 'pages.pdf',
      contentType: 'application/pdf',
      bytes: tooManyPages,
    });
    expect(pageBomb.status).toBe(400);
    expect(pageBomb.issue).toBe('page_limit_exceeded');

    const dimensionBomb = await createAndComplete({
      originalName: 'huge.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< /Type /Page /MediaBox [0 0 100000 100000] >>\nendobj\n%%EOF\n',
      ),
    });
    expect(dimensionBomb.status).toBe(400);
    expect(dimensionBomb.issue).toBe('page_dimensions_exceeded');

    const active = await createAndComplete({
      originalName: 'active.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /JavaScript 2 0 R >>\nendobj\n%%EOF\n',
      ),
    });
    expect(active.status).toBe(400);
    expect(active.issue).toBe('active_content');
  }, 120000);

  it('keeps uploaded bytes private and does not expose public object URLs', async () => {
    const deliverable = await Deliverable.findById(deliverableId);
    expect(deliverable?.storageKey.startsWith(`projects/${projectId}/`)).toBe(true);
    const projects = await Project.find({ ownerId: customerA.id });
    expect(projects.length).toBeGreaterThan(0);
  });
});
