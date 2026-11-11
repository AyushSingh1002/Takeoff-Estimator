import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrawingFile, Project } from '../projects/project.model';
import { claimNextJob, createJob, runNextStage } from '../jobs/job.service';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { AuditLog } from '../audit/audit.model';
import { BoqItem } from '../pipeline/boqItem.model';
import { Discrepancy } from '../pipeline/discrepancy.model';
import { Measurement } from '../pipeline/measurement.model';
import { InMemoryObjectStorage } from '../../providers/storage';
import {
  addManualMeasurement,
  approveJob,
  approveJobAndDeliver,
  assignReviewer,
  DeliverableCompilationError,
  getJobDetail,
  getReviewSheetDetail,
  listAssignedJobs,
  listReviewSheets,
  rejectJob,
  resolveDiscrepancy,
  updateMeasurement,
} from './review.service';
import { QAReview } from './qaReview.model';
import { updateMeasurementBodySchema } from './review.schemas';
import { compileDeliverables } from '../deliverables/deliverable.service';
import { Deliverable } from '../deliverables/deliverable.model';

describe('reviewer workstation (M7)', () => {
  let mongoServer: MongoMemoryServer | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.MONGODB_URI = (await MongoMemoryServer.create()).getUri('takeoff_estimator_m7');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      TakeoffJob.deleteMany({}),
      QAReview.deleteMany({}),
      BoqItem.deleteMany({}),
      Discrepancy.deleteMany({}),
      Measurement.deleteMany({}),
      AuditLog.deleteMany({}),
      DrawingFile.deleteMany({}),
      Deliverable.deleteMany({}),
      Project.deleteMany({}),
    ]);
  });

  async function runAwaitingReviewJob(): Promise<string> {
    const project = await Project.create({
      ownerId: 'cust-1',
      name: 'Review project',
      reference: `P-${new mongoose.Types.ObjectId().toString()}`,
      regionPackCode: 'us',
      status: 'in_progress',
    });
    const projectId = project._id.toString();
    const file = await DrawingFile.create({
      projectId,
      originalName: 'floor_plan.pdf',
      storageKey: 'projects/p1/files/clean-z',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'ingested',
    });
    await createJob({
      projectId,
      fileIds: [file._id.toString()],
      reason: 'initial',
    });
    const claimed = await claimNextJob();
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
    return jobId;
  }

  async function assignTestReviewer(jobId: string, reviewerId = 'rev-1'): Promise<void> {
    await QAReview.create({
      jobId,
      reviewerId,
      kind: 'primary',
      status: 'assigned',
      assignedBy: 'admin-1',
    });
  }

  it('assigns a reviewer and returns the assigned job in the reviewer queue', async () => {
    const jobId = await runAwaitingReviewJob();
    const review = await assignReviewer({ jobId, reviewerId: 'rev-1', assignedBy: 'admin-1' });
    expect(review.status).toBe('assigned');
    const queue = await listAssignedJobs('rev-1');
    expect(queue).toHaveLength(1);
    expect(queue[0]?.job._id.toString()).toBe(jobId);
    expect(queue[0]?.counts.sheets).toBeGreaterThan(0);
    expect(queue[0]?.counts.openDiscrepancies).toBe(0);
    const otherQueue = await listAssignedJobs('rev-2');
    expect(otherQueue).toHaveLength(0);
  });

  it('returns job detail for an assigned reviewer and starts the review', async () => {
    const jobId = await runAwaitingReviewJob();
    await assignReviewer({ jobId, reviewerId: 'rev-1', assignedBy: 'admin-1' });
    const detail = await getJobDetail(jobId, 'rev-1');
    expect(detail.job._id.toString()).toBe(jobId);
    expect(detail.job.status).toBe('in_review');
    expect(detail.reviewStatus).toBe('in_progress');
    expect(detail.counts.boqItems).toBeGreaterThan(0);
    const review = await QAReview.findOne({ jobId, reviewerId: 'rev-1' });
    expect(review?.status).toBe('in_progress');
    expect(review?.startedAt).toBeInstanceOf(Date);
    await expect(getJobDetail(jobId, 'rev-9')).rejects.toThrow(/Reviewer not assigned/);
  });

  it('lists review sheets with overlay counts and returns a signed page for an assigned reviewer', async () => {
    const jobId = await runAwaitingReviewJob();
    await assignReviewer({ jobId, reviewerId: 'rev-1', assignedBy: 'admin-1' });
    const sheets = await listReviewSheets(jobId, 'rev-1');
    expect(sheets.length).toBeGreaterThan(0);
    const first = sheets[0];
    if (first === undefined) {
      throw new Error('Expected a review sheet');
    }
    expect(first.sheetRef.startsWith('sheet:')).toBe(true);
    expect(first.measurementCount).toBeGreaterThan(0);
    expect(first.openDiscrepancies).toBe(0);

    const storage = new InMemoryObjectStorage();
    const detail = await getReviewSheetDetail(storage, jobId, first.id, 'rev-1');
    expect(detail.sheet.sheetRef).toBe(first.sheetRef);
    expect(detail.image.url).toContain('presigned=true');
    expect(detail.measurements.length).toBe(first.measurementCount);
    expect(detail.objects.length).toBe(first.objectCount);
    await expect(getReviewSheetDetail(storage, jobId, first.id, 'rev-9')).rejects.toThrow(
      /Reviewer not assigned/,
    );
  });

  it('blocks approval while a blocking discrepancy is open and approves after resolution', async () => {
    const jobId = await runAwaitingReviewJob();
    await assignTestReviewer(jobId);
    const discrepancy = await Discrepancy.create({
      projectId: 'p1',
      jobId,
      type: 'missing_scale',
      severity: 'blocking',
      status: 'open',
      note: 'Scale missing',
    });
    await expect(approveJob({ jobId, reviewerId: 'rev-1' })).rejects.toThrow(
      /Blocking discrepancies open/,
    );

    await resolveDiscrepancy({
      jobId,
      discrepancyId: discrepancy._id.toString(),
      reviewerId: 'rev-1',
      decision: 'resolve',
      note: 'Scale confirmed by reviewer',
    });
    const job = await approveJob({ jobId, reviewerId: 'rev-1' });
    expect(job.status).toBe('approved');
    const updatedReview = await QAReview.findOne({ jobId, reviewerId: 'rev-1' });
    expect(updatedReview?.status).toBe('approved');
  });

  it('compiles deliverables on approval and keeps a failed compilation retryable', async () => {
    const jobId = await runAwaitingReviewJob();
    await assignTestReviewer(jobId);
    const failingStorage = {
      put: async (): Promise<void> => {
        throw new Error('storage unavailable');
      },
    };
    await expect(
      approveJobAndDeliver({ jobId, reviewerId: 'rev-1', storage: failingStorage }),
    ).rejects.toBeInstanceOf(DeliverableCompilationError);

    const approved = await TakeoffJob.findById(jobId);
    expect(approved?.status).toBe('approved');
    expect(await Deliverable.countDocuments({ jobId })).toBe(0);

    const retried = await compileDeliverables({
      jobId,
      actorId: 'rev-1',
      actorRole: 'reviewer',
      storage: new InMemoryObjectStorage(),
    });
    expect(retried).toHaveLength(2);
    const delivered = await TakeoffJob.findById(jobId);
    expect(delivered?.status).toBe('delivered');
    expect(await Deliverable.countDocuments({ jobId })).toBe(2);
  });

  it('rejects a job decision without a reason', async () => {
    const jobId = await runAwaitingReviewJob();
    const review = await QAReview.create({
      jobId,
      reviewerId: 'rev-1',
      kind: 'primary',
      status: 'assigned',
      assignedBy: 'admin-1',
    });
    expect(review.status).toBe('assigned');
    await expect(rejectJob({ jobId, reviewerId: 'rev-1', reason: '   ' })).rejects.toThrow(
      /Rejection reason required/,
    );
    const rejected = await rejectJob({
      jobId,
      reviewerId: 'rev-1',
      reason: 'Missing structural notes',
    });
    expect(rejected.status).toBe('review_rejected');
    const updatedReview = await QAReview.findOne({ jobId, reviewerId: 'rev-1' });
    expect(updatedReview?.status).toBe('rejected');
  });

  it('recomputes the BOQ from a reviewer measurement edit and writes an audit entry', async () => {
    const jobId = await runAwaitingReviewJob();
    await assignTestReviewer(jobId);
    const measurements = await Measurement.find({ jobId });
    expect(measurements.length).toBeGreaterThan(0);
    const measurement = measurements[0];
    if (measurement === undefined) {
      throw new Error('Expected a measurement');
    }
    const correctedValue = measurement.value * 2;
    const geometry = {
      kind: 'Polygon' as const,
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    };
    const updated = await updateMeasurement({
      jobId,
      measurementId: measurement._id.toString(),
      reviewerId: 'rev-1',
      value: correctedValue,
      geometry,
      note: 'Reviewer correction',
    });
    expect(updated.value).toBe(correctedValue);
    expect(updated.geometry).toEqual(geometry);
    const boqItems = await BoqItem.find({ jobId });
    expect(boqItems.length).toBeGreaterThan(0);
    for (const boqItem of boqItems) {
      expect(boqItem.quantity).toBe(correctedValue);
      expect(boqItem.adjustedQuantity).toBeCloseTo(correctedValue * (1 + boqItem.wasteFactor), 5);
    }
    const audits = await AuditLog.find({
      entityType: 'Measurement',
      entityId: measurement._id.toString(),
    });
    expect(audits.length).toBeGreaterThan(0);
  });

  it('adds a manual measurement for a reviewer', async () => {
    const jobId = await runAwaitingReviewJob();
    await assignTestReviewer(jobId);
    const measurement = await addManualMeasurement({
      jobId,
      reviewerId: 'rev-1',
      type: 'area',
      value: 42,
      unit: 'm2',
      note: 'Manual overlay',
    });
    expect(measurement.value).toBe(42);
    expect(measurement.method).toBe('manual_reviewer');
  });

  it('requires a note and a value or geometry for measurement edits', () => {
    expect(updateMeasurementBodySchema.safeParse({ value: 12 }).success).toBe(false);
    expect(updateMeasurementBodySchema.safeParse({ note: 'Corrected' }).success).toBe(false);
    expect(
      updateMeasurementBodySchema.safeParse({ value: 12, note: 'Corrected by reviewer' }).success,
    ).toBe(true);
    expect(
      updateMeasurementBodySchema.safeParse({
        geometry: {
          kind: 'LineString',
          coordinates: [
            [0, 0],
            [6, 4],
          ],
        },
        note: 'Geometry corrected',
      }).success,
    ).toBe(true);
  });
});
