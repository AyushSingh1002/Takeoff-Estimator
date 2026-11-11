import { randomUUID } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { can } from '../../middleware/policy';
import { AuditLog } from '../audit/audit.model';
import { User } from '../auth/auth.model';
import { compileDeliverables } from '../deliverables/deliverable.service';
import { Deliverable } from '../deliverables/deliverable.model';
import { BoqItem } from '../pipeline/boqItem.model';
import { Project } from '../projects/project.model';
import { createProject } from '../projects/project.service';
import { AccuracyBenchmark } from './accuracyBenchmark.model';
import { AccuracyClaim } from './accuracyClaim.model';
import { ACCURACY_TOLERANCE_PCT, computeVariance } from './accuracy.metrics';
import {
  decideAccuracyClaim,
  fileAccuracyClaim,
  getAccuracyClaimDetail,
  listAccuracyClaims,
  recordAccuracyBenchmark,
} from './accuracy.service';
import { TakeoffJob } from '../jobs/takeoffJob.model';

const storage = {
  put: async (): Promise<void> => undefined,
};

async function makeUser(): Promise<string> {
  const user = await User.create({
    email: `accuracy-${randomUUID()}@example.com`,
    passwordHash: 'test-hash',
    name: 'Accuracy Test User',
  });
  return user._id.toString();
}

async function makeDeliveredJob(input: {
  projectId: string;
  deliveredAt?: Date;
  fileIds?: string[];
  priceQuote?: {
    planCode: 'per_takeoff';
    planVersion: number;
    amountMinor: number;
    currency: string;
    isFreeTrial: boolean;
    overage: boolean;
  };
}): Promise<string> {
  const deliveredAt = input.deliveredAt ?? new Date();
  const job = await TakeoffJob.create({
    projectId: input.projectId,
    reason: 'initial',
    status: 'delivered',
    stages: [
      { name: 'recognize', status: 'done', attempts: 1 },
      { name: 'measure', status: 'done', attempts: 1 },
      { name: 'convert', status: 'done', attempts: 1 },
      { name: 'verify', status: 'done', attempts: 1 },
    ],
    sla: {
      submittedAt: new Date(deliveredAt.getTime() - 60 * 60 * 1000),
      deliveredAt,
      deadlineAt: new Date(deliveredAt.getTime() + 60 * 60 * 1000),
      status: 'met',
    },
    fileIds: input.fileIds ?? [],
    ...(input.priceQuote === undefined ? {} : { priceQuote: input.priceQuote }),
  });
  return job._id.toString();
}

async function addBoqItems(input: {
  projectId: string;
  jobId: string;
  code: string;
  trade: string;
  unit: string;
  quantities: number[];
}): Promise<void> {
  await BoqItem.insertMany(
    input.quantities.map((quantity) => ({
      projectId: input.projectId,
      jobId: input.jobId,
      trade: input.trade,
      code: input.code,
      description: 'Benchmark line',
      quantity,
      unit: input.unit,
      wasteFactor: 0.05,
      adjustedQuantity: quantity * 1.05,
      measurementIds: [],
      sheetRefs: [],
      rulePackId: 'rule-pack-1',
      ruleKey: input.code,
      engineVersion: '0.1.0',
      assumptions: [],
      reviewStatus: 'accepted' as const,
    })),
  );
}

async function makeClaim(input: {
  userId: string;
  projectId: string;
  jobId: string;
}): Promise<string> {
  const claim = await fileAccuracyClaim(input.userId, input.projectId, {
    jobId: input.jobId,
    reason: 'Independent estimator figure differs',
    evidence: [`projects/${input.projectId}/files/evidence-1`],
  });
  return claim._id.toString();
}

describe('accuracy claims (M10)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m10');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      AuditLog.deleteMany({}),
      User.deleteMany({}),
      Project.deleteMany({}),
      TakeoffJob.deleteMany({}),
      BoqItem.deleteMany({}),
      Deliverable.deleteMany({}),
      AccuracyClaim.deleteMany({}),
      AccuracyBenchmark.deleteMany({}),
    ]);
  });

  it('computes variance and applies the +/-3% tolerance per line', () => {
    expect(ACCURACY_TOLERANCE_PCT).toBe(3);
    expect(computeVariance(100, 100)).toEqual({ variancePct: 0, withinTolerance: true });
    expect(computeVariance(100, 103)).toEqual({ variancePct: 3, withinTolerance: true });
    expect(computeVariance(100, 97)).toEqual({ variancePct: -3, withinTolerance: true });
    expect(computeVariance(100, 104).withinTolerance).toBe(false);
    expect(computeVariance(100, 96).withinTolerance).toBe(false);
  });

  it('files claims only on delivered jobs within the claim window', async () => {
    const userId = await makeUser();
    const otherUserId = await makeUser();
    const project = await createProject(userId, { name: 'Claims project' });
    const projectId = project._id.toString();
    const jobId = await makeDeliveredJob({ projectId });

    const claim = await fileAccuracyClaim(userId, projectId, {
      jobId,
      reason: 'Independent benchmark attached',
      evidence: [`projects/${projectId}/files/evidence-1`],
    });
    expect(claim.status).toBe('submitted');
    expect(claim.filedBy).toBe(userId);
    expect(claim.evidence).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'accuracy.claim.create' })).toBe(1);

    await expect(
      fileAccuracyClaim(userId, projectId, {
        jobId,
        reason: 'Duplicate claim',
        evidence: [],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    await expect(
      fileAccuracyClaim(otherUserId, projectId, {
        jobId,
        reason: 'Not mine',
        evidence: [],
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    await expect(
      fileAccuracyClaim(userId, projectId, {
        jobId,
        reason: 'Cross-project evidence',
        evidence: ['projects/another-project/files/evidence-1'],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });

    const openJob = await TakeoffJob.create({
      projectId,
      reason: 'initial',
      status: 'queued',
      stages: [{ name: 'recognize', status: 'pending', attempts: 0 }],
      sla: { deadlineAt: new Date(), status: 'on_track' },
      fileIds: [],
    });
    await expect(
      fileAccuracyClaim(userId, projectId, {
        jobId: openJob._id.toString(),
        reason: 'Not delivered',
        evidence: [],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    const expiredProject = await createProject(userId, { name: 'Expired claim project' });
    const expiredJobId = await makeDeliveredJob({
      projectId: expiredProject._id.toString(),
      deliveredAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });
    await expect(
      fileAccuracyClaim(userId, expiredProject._id.toString(), {
        jobId: expiredJobId,
        reason: 'Too late',
        evidence: [],
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('records an independent benchmark and computes delivered variance', async () => {
    const userId = await makeUser();
    const project = await createProject(userId, { name: 'Benchmark project' });
    const projectId = project._id.toString();
    const jobId = await makeDeliveredJob({ projectId });
    await addBoqItems({
      projectId,
      jobId,
      trade: 'drywall',
      code: 'drywall.board',
      unit: 'm2',
      quantities: [60, 40],
    });
    const claimId = await makeClaim({ userId, projectId, jobId });

    await expect(
      recordAccuracyBenchmark('admin-1', claimId, {
        source: 'customer_challenge',
        lines: [{ trade: 'drywall', code: 'missing.line', benchmarkQuantity: 100, unit: 'm2' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });

    await expect(
      recordAccuracyBenchmark('admin-1', claimId, {
        source: 'customer_challenge',
        lines: [{ trade: 'drywall', code: 'drywall.board', benchmarkQuantity: 100, unit: 'm3' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });

    const benchmark = await recordAccuracyBenchmark('admin-1', claimId, {
      source: 'customer_challenge',
      lines: [{ trade: 'drywall', code: 'drywall.board', benchmarkQuantity: 105, unit: 'm2' }],
    });
    expect(benchmark.lines[0]?.deliveredQuantity).toBe(100);
    expect(benchmark.lines[0]?.variancePct).toBeCloseTo(-4.7619, 4);
    expect(benchmark.withinTolerance).toBe(false);
    expect(benchmark.metricVersion).toBe('od02.v1');

    const claim = await AccuracyClaim.findById(claimId);
    expect(claim?.status).toBe('under_review');
    expect(claim?.benchmarkId).toBe(benchmark._id.toString());
    expect(await AuditLog.countDocuments({ action: 'accuracy.benchmark' })).toBe(1);

    const detail = await getAccuracyClaimDetail(claimId);
    expect(detail.claim._id.toString()).toBe(claimId);
    expect(detail.benchmark?._id.toString()).toBe(benchmark._id.toString());
    expect(detail.benchmark?.lines).toHaveLength(1);
    await expect(
      getAccuracyClaimDetail(new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('rejects a claim with a recorded decision and refuses a second decision', async () => {
    const userId = await makeUser();
    const project = await createProject(userId, { name: 'Reject project' });
    const projectId = project._id.toString();
    const jobId = await makeDeliveredJob({ projectId });
    await addBoqItems({
      projectId,
      jobId,
      trade: 'concrete',
      code: 'concrete.volume',
      unit: 'm3',
      quantities: [10],
    });
    const claimId = await makeClaim({ userId, projectId, jobId });

    await expect(
      decideAccuracyClaim('admin-1', claimId, { decision: 'reject', note: 'No benchmark yet' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    await recordAccuracyBenchmark('admin-1', claimId, {
      source: 'licensed_estimator',
      lines: [{ trade: 'concrete', code: 'concrete.volume', benchmarkQuantity: 12, unit: 'm3' }],
    });
    await expect(
      decideAccuracyClaim('admin-1', claimId, { decision: 'uphold', note: 'Outside tolerance' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    const beforeJobs = await TakeoffJob.countDocuments({ projectId });
    const result = await decideAccuracyClaim('admin-1', claimId, {
      decision: 'reject',
      note: 'Variance is outside the tolerance',
    });
    expect(result.job).toBeNull();
    expect(result.claim.status).toBe('rejected');
    expect(result.claim.decision?.by).toBe('admin-1');
    expect(result.claim.decision?.note).toBe('Variance is outside the tolerance');
    expect(await TakeoffJob.countDocuments({ projectId })).toBe(beforeJobs);
    expect(await AuditLog.countDocuments({ action: 'accuracy.claim.reject' })).toBe(1);

    await expect(
      decideAccuracyClaim('admin-1', claimId, { decision: 'reject', note: 'Again' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('upholds an in-tolerance claim and links a free re-takeoff job', async () => {
    const userId = await makeUser();
    const project = await createProject(userId, { name: 'Uphold project' });
    const projectId = project._id.toString();
    const jobId = await makeDeliveredJob({
      projectId,
      fileIds: ['file-1', 'file-2'],
      priceQuote: {
        planCode: 'per_takeoff',
        planVersion: 1,
        amountMinor: 12345,
        currency: 'USD',
        isFreeTrial: false,
        overage: false,
      },
    });
    await addBoqItems({
      projectId,
      jobId,
      trade: 'drywall',
      code: 'drywall.board',
      unit: 'm2',
      quantities: [60, 40],
    });
    const claimId = await makeClaim({ userId, projectId, jobId });
    await recordAccuracyBenchmark('admin-1', claimId, {
      source: 'customer_challenge',
      lines: [{ trade: 'drywall', code: 'drywall.board', benchmarkQuantity: 100, unit: 'm2' }],
    });

    const result = await decideAccuracyClaim('admin-1', claimId, {
      decision: 'uphold',
      note: 'Within the agreed metric',
    });
    expect(result.claim.status).toBe('retakeoff_in_progress');
    expect(result.claim.retakeoffJobId).toBe(result.job?._id.toString());

    const retakeoff = result.job;
    if (retakeoff === null) {
      throw new Error('Expected a re-takeoff job');
    }
    expect(retakeoff.reason).toBe('accuracy_retakeoff');
    expect(retakeoff.parentJobId).toBe(jobId);
    expect(retakeoff.fileIds).toEqual(['file-1', 'file-2']);
    expect(retakeoff.status).toBe('queued');
    expect(retakeoff.priceQuote?.amountMinor).toBe(0);
    expect(retakeoff.priceQuote?.planCode).toBe('per_takeoff');
    expect(retakeoff.sla.deadlineAt.getTime() - (retakeoff.sla.submittedAt?.getTime() ?? 0)).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(await AuditLog.countDocuments({ action: 'accuracy.claim.uphold' })).toBe(1);

    await expect(
      decideAccuracyClaim('admin-1', claimId, { decision: 'uphold', note: 'Again' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });

    await TakeoffJob.updateOne({ _id: retakeoff._id }, { status: 'approved' });
    await compileDeliverables({
      jobId: retakeoff._id.toString(),
      actorId: 'admin-1',
      actorRole: 'admin',
      storage,
    });
    const resolved = await AccuracyClaim.findById(claimId);
    expect(resolved?.status).toBe('resolved');
    expect(await AuditLog.countDocuments({ action: 'accuracy.claim.resolve' })).toBe(1);
  });

  it('lists only the customer claims for customers and all claims for admins', async () => {
    const firstUser = await makeUser();
    const secondUser = await makeUser();
    const firstProject = await createProject(firstUser, { name: 'First claims' });
    const secondProject = await createProject(secondUser, { name: 'Second claims' });
    const firstJob = await makeDeliveredJob({ projectId: firstProject._id.toString() });
    const secondJob = await makeDeliveredJob({ projectId: secondProject._id.toString() });
    await makeClaim({
      userId: firstUser,
      projectId: firstProject._id.toString(),
      jobId: firstJob,
    });
    await makeClaim({
      userId: secondUser,
      projectId: secondProject._id.toString(),
      jobId: secondJob,
    });

    const customerClaims = await listAccuracyClaims(
      { id: firstUser, role: 'customer' },
      { limit: 100, offset: 0 },
    );
    expect(customerClaims).toHaveLength(1);
    expect(customerClaims[0]?.filedBy).toBe(firstUser);

    const adminClaims = await listAccuracyClaims(
      { id: 'admin-1', role: 'admin' },
      { limit: 100, offset: 0 },
    );
    expect(adminClaims).toHaveLength(2);

    expect(can({ id: firstUser, role: 'customer' }, 'accuracy.claim.create')).toBe(true);
    expect(can({ id: firstUser, role: 'customer' }, 'accuracy.claim.list')).toBe(true);
    expect(can({ id: firstUser, role: 'customer' }, 'admin.accuracy')).toBe(false);
    expect(can({ id: 'reviewer-1', role: 'reviewer' }, 'accuracy.claim.list')).toBe(false);
    expect(can({ id: 'admin-1', role: 'admin' }, 'admin.accuracy')).toBe(true);
    expect(can({ id: 'admin-1', role: 'admin' }, 'accuracy.claim.list')).toBe(true);
  });
});
