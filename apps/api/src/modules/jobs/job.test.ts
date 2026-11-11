import { randomUUID } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { User } from '../auth/auth.model';
import { seedPricingPlans } from '../pricing/pricing.seed';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { DrawingFile } from '../projects/project.model';
import { createProject, getProject, submitProject } from '../projects/project.service';
import {
  createJob,
  claimNextJob,
  evaluateSla,
  failStage,
  getJobById,
  retryStage,
  runNextStage,
  startStage,
} from './job.service';
import { TakeoffJob } from './takeoffJob.model';

describe('jobs (M4 job runner)', () => {
  let mongoServer: MongoMemoryServer | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.MONGODB_URI = (await MongoMemoryServer.create()).getUri('takeoff_estimator_m4');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
    await seedPricingPlans('test-seed');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it('creates a job with pending stages and an SLA deadline', async () => {
    const job = await createJob({ projectId: 'p1', fileIds: [], reason: 'initial' });
    expect(job.status).toBe('queued');
    expect(job.stages).toHaveLength(4);
    expect(job.stages[0]?.status).toBe('pending');
    expect(job.sla.status).toBe('on_track');
    expect(job.sla.deadlineAt.getTime()).toBeGreaterThan(Date.now());
    await TakeoffJob.deleteOne({ projectId: 'p1' });
  });

  it('claims the oldest queued job and leases it', async () => {
    await createJob({ projectId: 'p1', fileIds: [], reason: 'initial' });
    const claimed = await claimNextJob();
    expect(claimed).not.toBeNull();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    expect(claimed.status).toBe('processing');
    expect(claimed.leaseExpiresAt).toBeDefined();
    expect(claimed.sla.processingStartedAt).toBeDefined();
    const second = await claimNextJob();
    expect(second).toBeNull();
    await TakeoffJob.deleteMany({ projectId: 'p1' });
  });

  it('runs the fixture stage chain and awaits review when all stages complete', async () => {
    const file = await DrawingFile.create({
      projectId: 'p1',
      originalName: 'floor_plan.pdf',
      storageKey: 'projects/p1/files/clean-z',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'ingested',
    });
    await createJob({
      projectId: 'p1',
      fileIds: [file._id.toString()],
      reason: 'initial',
    });
    const claimed = await claimNextJob();
    expect(claimed).not.toBeNull();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    const jobId = claimed._id.toString();
    for (let index = 0; index < 4; index += 1) {
      const updated = await runNextStage(jobId);
      if (index === 3) {
        expect(updated.status).toBe('awaiting_review');
      }
    }
  });

  it('resumes a crashed job at the first incomplete stage after lease expiry', async () => {
    const file = await DrawingFile.create({
      projectId: 'p1',
      originalName: 'floor_plan.pdf',
      storageKey: 'projects/p1/files/clean-z',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'ingested',
    });
    await createJob({
      projectId: 'p1',
      fileIds: [file._id.toString()],
      reason: 'initial',
    });
    const claimed = await claimNextJob();
    expect(claimed).not.toBeNull();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    const jobId = claimed._id.toString();
    await startStage(jobId, 'recognize');
    await TakeoffJob.updateOne(
      { _id: claimed._id },
      { leaseExpiresAt: new Date(Date.now() - 1000) },
    );
    const resumed = await claimNextJob();
    expect(resumed).not.toBeNull();
    if (resumed === null) {
      throw new Error('Expected a resumed job');
    }
    const afterResume = await getJobById(resumed._id.toString());
    expect(afterResume?.stages[0]?.status).toBe('pending');
    for (let index = 0; index < 4; index += 1) {
      const updated = await runNextStage(resumed._id.toString());
      if (index === 3) {
        expect(updated.status).toBe('awaiting_review');
      }
    }
  });

  it('retries a failed stage within the retry budget and fails the job when exhausted', async () => {
    await createJob({ projectId: 'p1', fileIds: [], reason: 'initial' });
    const claimed = await claimNextJob();
    expect(claimed).not.toBeNull();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    const jobId = claimed._id.toString();
    const started = await startStage(jobId, 'recognize');
    expect(started.attempts).toBe(1);
    await failStage(jobId, 'recognize', 'boom');
    const afterFail = await getJobById(jobId);
    expect(afterFail?.status).toBe('processing');
    await retryStage(jobId, 'recognize');
    const restarted = await startStage(jobId, 'recognize');
    expect(restarted.attempts).toBe(2);
    await failStage(jobId, 'recognize', 'boom');
    await retryStage(jobId, 'recognize');
    const third = await startStage(jobId, 'recognize');
    expect(third.attempts).toBe(3);
    await failStage(jobId, 'recognize', 'boom');
    const failed = await getJobById(jobId);
    expect(failed?.status).toBe('failed');
    await expect(retryStage(jobId, 'recognize')).rejects.toThrow();
  });

  it('evaluates the SLA status', async () => {
    const job = await createJob({ projectId: 'p1', fileIds: [], reason: 'initial' });
    const jobId = job._id.toString();
    const onTrack = await evaluateSla(jobId);
    expect(onTrack.sla.status).toBe('on_track');
    const stored = await getJobById(jobId);
    if (stored === null) {
      throw new Error('job missing');
    }
    stored.sla.deadlineAt = new Date(Date.now() - 1000);
    await stored.save();
    const breached = await evaluateSla(jobId);
    expect(breached.sla.status).toBe('breached');
    stored.sla.deliveredAt = new Date();
    stored.status = 'delivered';
    await stored.save();
    const met = await evaluateSla(jobId);
    expect(met.sla.status).toBe('met');
  });

  it('submits a project and creates a takeoff job that locks ingested files', async () => {
    const user = await User.create({
      email: 'm4-submit@example.com',
      passwordHash: 'test-hash',
      name: 'M4 Submit',
    });
    const userId = user._id.toString();
    const project = await createProject(userId, { name: 'M4 submit fixture' });
    const projectId = project._id.toString();
    const file = await DrawingFile.create({
      projectId: projectId,
      originalName: 'floor_plan.pdf',
      storageKey: `projects/${projectId}/files/${randomUUID()}`,
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'ingested',
    });
    await DrawingSheet.create({
      projectId,
      fileId: file._id.toString(),
      pageNumber: 1,
      sourceKind: 'vector_pdf',
      classification: 'floor_plan',
      classificationConfidence: 0.9,
      scale: { status: 'detected', ratio: 0.01 },
    });
    const { job } = await submitProject(userId, projectId);
    expect(job.status).toBe('queued');
    expect(job.priceQuote?.planCode).toBe('free_trial');
    expect(job.priceQuote?.isFreeTrial).toBe(true);
    expect(job.priceQuote?.amountMinor).toBe(0);
    const freshProject = await getProject(userId, projectId);
    expect(freshProject?.status).toBe('in_progress');
    const files = await DrawingFile.find({ projectId });
    const owned = files.find((candidate) => candidate._id.toString() === file._id.toString());
    expect(owned?.jobId).toBe(job._id.toString());
  });
});
