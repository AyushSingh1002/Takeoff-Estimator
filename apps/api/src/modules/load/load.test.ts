import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimNextJob, createJob, runNextStage } from '../jobs/job.service';
import { BoqItem } from '../pipeline/boqItem.model';
import { DetectedObject } from '../pipeline/detectedObject.model';
import { Measurement } from '../pipeline/measurement.model';
import { Discrepancy } from '../pipeline/discrepancy.model';
import { runConvert, runMeasure, runRecognize, runVerify } from '../pipeline/pipeline.service';
import { getFixtureIntake } from '../ingestion/fixtureProvider';
import { DrawingFile } from '../projects/project.model';

const LARGE_FILE_COUNT = 40;

function cleanStorageKey(index: number): { key: string; name: string } {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const key = `projects/load/files/large-${index}-${attempt}`;
    const name = `drawing-${index}-${attempt}.pdf`;
    const intake = getFixtureIntake(key, name);
    if (intake.status === 'ingested' && intake.missingScalePages === 0) {
      return { key, name };
    }
  }
  throw new Error('Could not find a clean fixture key');
}

describe('large-set pipeline robustness (M11)', () => {
  let mongoServer: MongoMemoryServer | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m11_load');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
  });

  it('processes a large multi-file job deterministically and idempotently', async () => {
    const fileIds: string[] = [];
    let expectedSheets = 0;
    for (let index = 0; index < LARGE_FILE_COUNT; index += 1) {
      const { key, name } = cleanStorageKey(index);
      const intake = getFixtureIntake(key, name);
      expectedSheets += intake.sheets.length;
      const file = await DrawingFile.create({
        projectId: 'load-project',
        originalName: name,
        storageKey: key,
        sizeBytes: 1024,
        contentType: 'application/pdf',
        status: 'ingested',
      });
      fileIds.push(file._id.toString());
    }

    await createJob({
      projectId: 'load-project',
      fileIds,
      reason: 'initial',
    });
    const claimed = await claimNextJob();
    expect(claimed).not.toBeNull();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    const jobId = claimed._id.toString();

    for (let stage = 0; stage < 4; stage += 1) {
      await runNextStage(jobId);
    }

    const objects = await DetectedObject.find({ jobId });
    const measurements = await Measurement.find({ jobId });
    const boqItems = await BoqItem.find({ jobId });
    const discrepancies = await Discrepancy.find({ jobId });
    const convertible = measurements.filter(
      (measurement) => measurement.type === 'area' || measurement.type === 'volume',
    ).length;

    expect(objects.length).toBe(expectedSheets);
    expect(measurements.length).toBe(expectedSheets);
    expect(boqItems.length).toBe(convertible);
    expect(discrepancies.length).toBe(0);

    const sheetIds = measurements.map((measurement) => measurement.sheetId);
    expect(new Set(sheetIds).size).toBe(sheetIds.length);
    const measurementIds = new Set(measurements.map((measurement) => measurement._id.toString()));
    for (const item of boqItems) {
      expect(item.measurementIds.length).toBeGreaterThan(0);
      for (const measurementId of item.measurementIds) {
        expect(measurementIds.has(measurementId)).toBe(true);
      }
    }

    await runRecognize(jobId);
    await runMeasure(jobId);
    await runConvert(jobId);
    await runVerify(jobId);

    expect(await DetectedObject.countDocuments({ jobId })).toBe(expectedSheets);
    expect(await Measurement.countDocuments({ jobId })).toBe(expectedSheets);
    expect(await BoqItem.countDocuments({ jobId })).toBe(convertible);
    expect(await Discrepancy.countDocuments({ jobId })).toBe(0);
  }, 120000);
});
