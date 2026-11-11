import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../audit/audit.model';
import { User } from '../auth/auth.model';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { createJob, evaluateSla, getJobById } from '../jobs/job.service';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { DrawingFile, Project } from '../projects/project.model';
import { createProject, submitProject } from '../projects/project.service';
import { PricingPlan } from './pricingPlan.model';
import { SEED_PLANS, seedPricingPlans } from './pricing.seed';
import {
  cancelSubscription,
  getEffectivePlan,
  getPricingPlan,
  getUserUsage,
  grantSubscription,
  publishPricingPlan,
  quoteProject,
  quoteProjectForSubmit,
} from './pricing.service';
import { Subscription } from './subscription.model';

async function makeUser(trialUsed = false): Promise<string> {
  const user = await User.create({
    email: `user-${randomUUID()}@example.com`,
    passwordHash: 'test-hash',
    name: 'Pricing Test User',
    ...(trialUsed ? { freeTrialUsedAt: new Date() } : {}),
  });
  return user._id.toString();
}

async function addSheetsForFile(projectId: string, fileId: string, count: number): Promise<void> {
  const existing = await DrawingSheet.countDocuments({ projectId });
  await DrawingSheet.insertMany(
    Array.from({ length: count }, (_value, index) => ({
      projectId,
      fileId,
      pageNumber: existing + index + 1,
      sourceKind: 'vector_pdf' as const,
      classification: 'floor_plan' as const,
      classificationConfidence: 0.9,
      scale: { status: 'detected' as const },
    })),
  );
}

async function addSheets(projectId: string, count: number): Promise<void> {
  await addSheetsForFile(projectId, 'file-1', count);
}

async function createIngestedFileFor(projectId: string): Promise<void> {
  const file = await DrawingFile.create({
    projectId,
    originalName: 'plans.pdf',
    storageKey: `projects/${projectId}/plans.pdf`,
    sizeBytes: 1024,
    contentType: 'application/pdf',
    status: 'ingested',
    pageCount: 1,
  });
  await addSheetsForFile(projectId, file._id.toString(), 1);
}

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('pricing, entitlements and SLA (M9)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m9_pricing');
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
      DrawingSheet.deleteMany({}),
      TakeoffJob.deleteMany({}),
      Subscription.deleteMany({}),
      PricingPlan.deleteMany({}),
    ]);
    await seedPricingPlans('test-seed');
  });

  it('publishes versioned plans and retires the previous active version', async () => {
    const first = await getEffectivePlan('per_takeoff');
    expect(first).not.toBeNull();
    if (first === null) {
      throw new Error('Expected the seeded per-takeoff plan');
    }
    expect(first.version).toBe(1);
    expect(first.status).toBe('active');

    const future = await publishPricingPlan(
      {
        code: 'per_takeoff',
        effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
        currency: 'USD',
        amountMinor: first.amountMinor + 1,
        parameters: {},
      },
      'admin-1',
    );
    expect(future.version).toBe(2);
    expect(future.status).toBe('draft');

    const stillFirst = await getEffectivePlan('per_takeoff');
    expect(stillFirst?.version).toBe(1);

    const due = await getEffectivePlan(
      'per_takeoff',
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    );
    expect(due?.version).toBe(2);
    expect((await getPricingPlan('per_takeoff', 1))?.status).toBe('retired');

    const immediate = await publishPricingPlan(
      {
        code: 'per_takeoff',
        currency: 'USD',
        amountMinor: first.amountMinor + 2,
        parameters: {},
      },
      'admin-1',
    );
    expect(immediate.version).toBe(3);
    expect(immediate.status).toBe('active');
    expect((await getPricingPlan('per_takeoff', 2))?.status).toBe('retired');
    expect((await getEffectivePlan('per_takeoff'))?.version).toBe(3);

    expect(await AuditLog.countDocuments({ action: 'pricing.publish' })).toBeGreaterThanOrEqual(5);
  });

  it('quotes a free trial and enforces the trial sheet cap', async () => {
    const userId = await makeUser();
    const project = await createProject(userId, { name: 'Trial quote' });
    const projectId = project._id.toString();
    await addSheets(projectId, 2);

    const quote = await quoteProject(userId, projectId);
    expect(quote.price.planCode).toBe('free_trial');
    expect(quote.price.isFreeTrial).toBe(true);
    expect(quote.price.amountMinor).toBe(0);
    expect(quote.sheetCount).toBe(2);
    expect(quote.includedSheets).toBe(2);
    expect(quote.excludedSheets).toBe(0);
    expect(quote.entitlement.allowed).toBe(true);
    expect(quote.targetTurnaroundHours).toBe(24);
    expect(quote.targetDeadlineAt.getTime()).toBeGreaterThan(Date.now());

    await addSheets(projectId, 10);
    const overCap = await quoteProject(userId, projectId);
    expect(overCap.sheetCount).toBe(12);
    expect(overCap.excludedSheets).toBe(2);
    expect(overCap.entitlement.allowed).toBe(false);
    expect(overCap.entitlement.code).toBe('ENTITLEMENT_EXCEEDED');

    await expect(quoteProjectForSubmit(userId, projectId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ENTITLEMENT_EXCEEDED',
    });
  });

  it('snapshots the trial price on submit, consumes the trial and falls back to per-takeoff', async () => {
    const userId = await makeUser();
    const project = await createProject(userId, { name: 'Trial submit' });
    const projectId = project._id.toString();
    await createIngestedFileFor(projectId);

    const { job } = await submitProject(userId, projectId);
    expect(job.priceQuote?.planCode).toBe('free_trial');
    expect(job.priceQuote?.isFreeTrial).toBe(true);
    expect(job.priceQuote?.amountMinor).toBe(0);
    expect(job.priceQuote?.currency).toBe('USD');
    expect(job.sla.deadlineAt.getTime()).toBeGreaterThan(job.sla.submittedAt?.getTime() ?? 0);

    const user = await User.findById(userId);
    expect(user?.freeTrialUsedAt).toBeInstanceOf(Date);

    const perTakeoff = await getEffectivePlan('per_takeoff');
    expect(perTakeoff).not.toBeNull();
    if (perTakeoff === null) {
      throw new Error('Expected the seeded per-takeoff plan');
    }
    const secondProject = await createProject(userId, { name: 'After trial' });
    const secondQuote = await quoteProject(userId, secondProject._id.toString());
    expect(secondQuote.price.planCode).toBe('per_takeoff');
    expect(secondQuote.price.isFreeTrial).toBe(false);
    expect(secondQuote.price.amountMinor).toBe(perTakeoff.amountMinor);

    const usage = await getUserUsage(userId);
    expect(usage.planCode).toBe('per_takeoff');
    expect(usage.trialAvailable).toBe(false);
    expect(usage.trialUsedAt).toBeInstanceOf(Date);
  });

  it('tracks unlimited-plan usage, flags overage and supports grant/cancel', async () => {
    const userId = await makeUser(true);
    const project = await createProject(userId, { name: 'Unlimited plan' });
    const projectId = project._id.toString();
    await createIngestedFileFor(projectId);

    const granted = await grantSubscription({ userId, action: 'grant' }, 'admin-1');
    expect(granted.status).toBe('active');
    expect(granted.planCode).toBe('unlimited');

    const unlimitedPlan = await getEffectivePlan('unlimited');
    expect(unlimitedPlan).not.toBeNull();
    if (unlimitedPlan === null) {
      throw new Error('Expected the seeded unlimited plan');
    }
    const included = unlimitedPlan.parameters.includedTakeoffs ?? 0;
    const overageAmountMinor = unlimitedPlan.parameters.overageAmountMinor ?? 0;

    const includedQuote = await quoteProject(userId, projectId);
    expect(includedQuote.price.planCode).toBe('unlimited');
    expect(includedQuote.price.amountMinor).toBe(0);
    expect(includedQuote.price.overage).toBe(false);

    const emptyUsage = await getUserUsage(userId);
    expect(emptyUsage.planCode).toBe('unlimited');
    expect(emptyUsage.used).toBe(0);
    expect(emptyUsage.includedTakeoffs).toBe(included);
    expect(emptyUsage.remaining).toBe(included);
    expect(emptyUsage.overageCount).toBe(0);

    for (let index = 0; index < included; index += 1) {
      await createJob({ projectId, fileIds: [], reason: 'initial' });
    }
    const overageQuote = await quoteProject(userId, projectId);
    expect(overageQuote.price.overage).toBe(true);
    expect(overageQuote.price.amountMinor).toBe(overageAmountMinor);

    await createJob({ projectId, fileIds: [], reason: 'initial' });
    const overageUsage = await getUserUsage(userId);
    expect(overageUsage.used).toBe(included + 1);
    expect(overageUsage.remaining).toBe(0);
    expect(overageUsage.overageCount).toBe(1);
    expect(overageUsage.overageAmountMinor).toBe(overageAmountMinor);

    const regranted = await grantSubscription({ userId, action: 'grant' }, 'admin-1');
    expect(regranted.status).toBe('active');
    expect(await Subscription.countDocuments({ userId, status: 'active' })).toBe(1);
    expect(await Subscription.countDocuments({ userId, status: 'cancelled' })).toBe(1);

    await cancelSubscription({ userId, action: 'cancel' }, 'admin-1');
    const afterCancel = await quoteProject(userId, projectId);
    expect(afterCancel.price.planCode).toBe('per_takeoff');
    await expect(cancelSubscription({ userId, action: 'cancel' }, 'admin-1')).rejects.toMatchObject(
      { statusCode: 404, code: 'NOT_FOUND' },
    );
    expect(await AuditLog.countDocuments({ action: 'subscription.grant' })).toBe(2);
    expect(await AuditLog.countDocuments({ action: 'subscription.cancel' })).toBe(1);
  });

  it('keeps the submitted price snapshot immutable when a new plan version is published', async () => {
    const userId = await makeUser(true);
    const project = await createProject(userId, { name: 'Snapshots' });
    const projectId = project._id.toString();
    await createIngestedFileFor(projectId);

    const quote = await quoteProject(userId, projectId);
    expect(quote.price.planCode).toBe('per_takeoff');
    expect(quote.price.planVersion).toBe(1);

    const { job } = await submitProject(userId, projectId);
    const newAmount = quote.price.amountMinor + 500;
    const published = await publishPricingPlan(
      {
        code: 'per_takeoff',
        currency: 'USD',
        amountMinor: newAmount,
        parameters: {},
      },
      'admin-1',
    );
    expect(published.version).toBe(2);

    const stored = await getJobById(job._id.toString());
    expect(stored?.priceQuote?.planVersion).toBe(1);
    expect(stored?.priceQuote?.amountMinor).toBe(quote.price.amountMinor);
    expect((await getPricingPlan('per_takeoff', 1))?.amountMinor).toBe(quote.price.amountMinor);

    const nextProject = await createProject(userId, { name: 'Snapshots next' });
    const nextQuote = await quoteProject(userId, nextProject._id.toString());
    expect(nextQuote.price.planVersion).toBe(2);
    expect(nextQuote.price.amountMinor).toBe(newAmount);
  });

  it('records SLA transitions from on_track to at_risk, breached and met', async () => {
    const job = await createJob({
      projectId: 'sla-project',
      fileIds: [],
      reason: 'initial',
      turnaroundHours: 10,
    });
    const jobId = job._id.toString();
    expect(job.sla.deadlineAt.getTime() - (job.sla.submittedAt?.getTime() ?? 0)).toBe(
      10 * 60 * 60 * 1000,
    );

    expect((await evaluateSla(jobId)).sla.status).toBe('on_track');

    const stored = await getJobById(jobId);
    if (stored === null) {
      throw new Error('Expected the job to exist');
    }
    stored.sla.submittedAt = new Date(Date.now() - 8 * 60 * 60 * 1000);
    stored.sla.deadlineAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await stored.save();
    expect((await evaluateSla(jobId)).sla.status).toBe('at_risk');

    stored.sla.deadlineAt = new Date(Date.now() - 60 * 1000);
    await stored.save();
    expect((await evaluateSla(jobId)).sla.status).toBe('breached');

    stored.sla.deliveredAt = new Date();
    stored.status = 'delivered';
    await stored.save();
    expect((await evaluateSla(jobId)).sla.status).toBe('met');
  });

  it('rejects quotes when no pricing plan is configured', async () => {
    await PricingPlan.deleteMany({});
    const userId = await makeUser();
    const project = await createProject(userId, { name: 'No pricing' });

    await expect(quoteProject(userId, project._id.toString())).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });

  it('keeps prices out of every source file except the central seed', () => {
    const values = new Set<number>();
    for (const plan of SEED_PLANS) {
      values.add(plan.amountMinor);
      const overage =
        'overageAmountMinor' in plan.parameters ? plan.parameters.overageAmountMinor : undefined;
      if (overage !== undefined) {
        values.add(overage);
      }
    }
    values.delete(0);

    const sources = [
      ...collectSourceFiles(resolve('apps/api/src')),
      ...collectSourceFiles(resolve('apps/web/src')),
    ];
    const offenders: string[] = [];
    for (const file of sources) {
      if (
        file.endsWith('pricing.seed.ts') ||
        file.endsWith('.test.ts') ||
        file.endsWith('.test.tsx')
      ) {
        continue;
      }
      const content = readFileSync(file, 'utf8');
      for (const value of values) {
        if (content.includes(String(value))) {
          offenders.push(`${file} contains ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
