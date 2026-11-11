import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrawingFile } from '../projects/project.model';
import { DrawingSheet } from './drawingSheet.model';
import { claimNextDrawingFile, runIngestion, type DrawingFileDoc } from './ingestion.service';
import { getFixtureIntake } from './fixtureProvider';

describe('ingestion (M3 stage 1)', () => {
  let mongoServer: MongoMemoryServer | undefined;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.MONGODB_URI = (await MongoMemoryServer.create()).getUri('takeoff_estimator_m3');
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

  it('exposes a deterministic intake report for a clean fixture drawing', () => {
    const intake = getFixtureIntake('projects/p1/files/clean-z', 'floor_plan.pdf');
    expect(intake.status).toBe('ingested');
    expect(intake.pageCount).toBeGreaterThan(0);
    expect(intake.sheets).toHaveLength(intake.pageCount);
    expect(intake.intakeReport.pageCount).toBe(intake.pageCount);
    expect(intake.intakeReport.status).toBe('ingested');
    expect(intake.intakeReport.unreadablePages).toBe(0);
    expect(intake.intakeReport.missingScalePages).toBe(0);
  });

  it('flags a missing scale in the intake report', () => {
    const intake = getFixtureIntake('projects/p1/files/missing-scale-1', 'rev.pdf');
    const missing = intake.sheets.filter((sheet) => sheet.scale.status === 'missing');
    expect(missing.length).toBeGreaterThan(0);
    expect(intake.intakeReport.missingScalePages).toBe(missing.length);
  });

  it('claims the oldest uploaded drawing file and moves it to ingesting', async () => {
    const file = await DrawingFile.create({
      projectId: 'p1',
      originalName: 'floor_plan.pdf',
      storageKey: 'projects/p1/files/fixture-q',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'uploaded',
    });
    const claimed = await claimNextDrawingFile();
    expect(claimed).not.toBeNull();
    expect(claimed?.status).toBe('ingesting');
    expect(claimed?.projectId).toBe(file.projectId);
  });

  it('ingests a clean fixture drawing into sheets and marks the file ingested', async () => {
    await DrawingFile.create({
      projectId: 'p1',
      originalName: 'floor_plan.pdf',
      storageKey: 'projects/p1/files/clean-z',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'uploaded',
    });
    const claimed = await claimNextDrawingFile();
    expect(claimed).not.toBeNull();
    const { file: updated, intake } = await runIngestion(claimed as DrawingFileDoc);
    expect(updated.status).toBe('ingested');
    expect(updated.pageCount).toBe(intake.pageCount);
    expect(updated.intakeReport).toBeDefined();
    const sheets = await DrawingSheet.find({ fileId: updated._id.toString() });
    expect(sheets.length).toBe(intake.pageCount);
  });

  it('flags an unreadable fixture drawing as rejected', async () => {
    await DrawingFile.create({
      projectId: 'p1',
      originalName: 'plan.pdf',
      storageKey: 'projects/p1/files/fixture-x',
      sizeBytes: 1024,
      contentType: 'application/pdf',
      status: 'uploaded',
    });
    const claimed = await claimNextDrawingFile();
    expect(claimed).not.toBeNull();
    const { file: updated, intake } = await runIngestion(claimed as DrawingFileDoc);
    expect(intake.status).toBe('rejected');
    expect(updated.status).toBe('rejected');
    expect(updated.rejectionReason).toBeDefined();
  });
});
