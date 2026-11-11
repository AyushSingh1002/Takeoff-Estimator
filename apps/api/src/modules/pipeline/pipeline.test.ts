import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrawingFile } from '../projects/project.model';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { sheetRefFor } from '../ingestion/sheetRef';
import { createJob, claimNextJob, runNextStage } from '../jobs/job.service';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { BoqItem } from './boqItem.model';
import { Discrepancy } from './discrepancy.model';
import { DetectedObject } from './detectedObject.model';
import { Measurement } from './measurement.model';

describe('pipeline stages 2-5 (M6)', () => {
  let mongoServer: MongoMemoryServer | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.MONGODB_URI = (await MongoMemoryServer.create()).getUri('takeoff_estimator_m6');
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
      DetectedObject.deleteMany({}),
      Measurement.deleteMany({}),
      BoqItem.deleteMany({}),
      Discrepancy.deleteMany({}),
      DrawingSheet.deleteMany({}),
    ]);
  });

  it('runs the end-to-end fixture pipeline and yields a traceable BOQ', async () => {
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
    const boqItems = await BoqItem.find({ jobId });
    expect(boqItems.length).toBeGreaterThan(0);
    const measurements = await Measurement.find({ jobId });
    expect(measurements.length).toBeGreaterThan(0);
    const discrepancies = await Discrepancy.find({ jobId });
    expect(discrepancies.length).toBe(0);
  });

  it('flags an uncalibrated sheet with a blocking discrepancy and skips the measurement', async () => {
    const file = await DrawingFile.create({
      projectId: 'p1',
      originalName: 'rev.pdf',
      storageKey: 'projects/p1/files/missing-scale-1',
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
    const discrepancies = await Discrepancy.find({ jobId });
    expect(discrepancies.length).toBe(1);
    expect(discrepancies[0]?.type).toBe('missing_scale');
    expect(discrepancies[0]?.severity).toBe('blocking');
    const flaggedSheetId = discrepancies[0]?.sheetId;
    expect(flaggedSheetId).toBeDefined();
    const measurements = await Measurement.find({ jobId });
    expect(measurements.some((measurement) => measurement.sheetId === flaggedSheetId)).toBe(false);
  });

  it('processes only sheets snapshotted on the job', async () => {
    const file = await DrawingFile.create({
      projectId: 'p1',
      originalName: 'snapshot.pdf',
      storageKey: 'projects/p1/files/clean-z',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'ingested',
    });
    const includedSheet = await DrawingSheet.create({
      projectId: 'p1',
      fileId: file._id.toString(),
      pageNumber: 1,
      sourceKind: 'vector_pdf',
      classification: 'floor_plan',
      classificationConfidence: 0.9,
      scale: { status: 'detected', ratio: 100, source: 'fixture' },
    });
    await createJob({
      projectId: 'p1',
      fileIds: [file._id.toString()],
      sheetIds: [includedSheet._id.toString()],
      reason: 'initial',
    });
    const claimed = await claimNextJob();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    const jobId = claimed._id.toString();
    for (let index = 0; index < 4; index += 1) {
      await runNextStage(jobId);
    }
    const expectedRef = sheetRefFor(file._id.toString(), 1);
    const objects = await DetectedObject.find({ jobId });
    const measurements = await Measurement.find({ jobId });
    expect(objects.length).toBeGreaterThan(0);
    expect(measurements.length).toBeGreaterThan(0);
    expect(objects.every((object) => object.sheetId === expectedRef)).toBe(true);
    expect(measurements.every((measurement) => measurement.sheetId === expectedRef)).toBe(true);
  });
});
