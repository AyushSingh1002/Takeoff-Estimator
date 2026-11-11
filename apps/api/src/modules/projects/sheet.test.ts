import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { InMemoryObjectStorage } from '../../providers/storage';
import { isMongoReady } from '../../db/mongo';
import { DrawingFile, Project } from './project.model';
import { DrawingSheet, type DrawingSheetAttrs } from '../ingestion/drawingSheet.model';
import { seedPricingPlans } from '../pricing/pricing.seed';

describe('customer sheets, quote and submit (Slice B)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  let storage: InMemoryObjectStorage;
  let customerCookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_sheets');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
    storage = new InMemoryObjectStorage();
    app = createApp({ storage, isMongoReady });
    await seedPricingPlans('test-seed');

    customerCookie = await registerAndLogin('sheets@example.com');
    otherCookie = await registerAndLogin('other-sheets@example.com');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  async function registerAndLogin(email: string): Promise<string> {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'supersecret123', name: 'Customer' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'supersecret123' });
    const setCookieHeader = login.headers['set-cookie'];
    const first: string | undefined = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader;
    return first?.split(';')[0] ?? '';
  }

  async function createDraft(name: string): Promise<string> {
    const response = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerCookie)
      .send({ name });
    expect(response.status).toBe(201);
    return response.body.project._id as string;
  }

  async function addFileWithSheets(
    projectId: string,
    sheets: Array<Partial<DrawingSheetAttrs>>,
    fileStatus: 'ingested' | 'ingesting' = 'ingested',
  ): Promise<string> {
    const file = await DrawingFile.create({
      projectId,
      originalName: 'floor_plan.pdf',
      storageKey: `projects/${projectId}/floor_plan.pdf`,
      sizeBytes: 2048,
      contentType: 'application/pdf',
      status: fileStatus,
      pageCount: sheets.length,
    });
    await DrawingSheet.create(
      sheets.map((sheet, index) => ({
        projectId,
        fileId: file._id.toString(),
        pageNumber: index + 1,
        sourceKind: 'vector_pdf',
        classification: 'floor_plan',
        classificationConfidence: 0.9,
        discipline: 'architectural',
        sheetType: 'floor_plan',
        quality: 'good',
        qualityReasons: [],
        widthPt: 842,
        heightPt: 595,
        scale: { status: 'detected', ratio: 0.01, label: '1:100', source: 'fixture' },
        inclusion: 'included',
        ...sheet,
      })),
    );
    return file._id.toString();
  }

  it('lists sheets, enforces ownership, excludes sheets and accepts a manual scale', async () => {
    const projectId = await createDraft('Intake review project');
    await addFileWithSheets(projectId, [{}, {}]);

    const list = await request(app)
      .get(`/api/v1/projects/${projectId}/sheets`)
      .set('Cookie', customerCookie);
    expect(list.status).toBe(200);
    expect(list.body.sheets).toHaveLength(2);
    expect(list.body.sheets[0].fileName).toBe('floor_plan.pdf');
    expect(list.body.sheets[0].inclusion).toBe('included');
    const firstSheetId: string = list.body.sheets[0].id;
    const secondSheetId: string = list.body.sheets[1].id;

    const crossList = await request(app)
      .get(`/api/v1/projects/${projectId}/sheets`)
      .set('Cookie', otherCookie);
    expect(crossList.status).toBe(404);

    const exclude = await request(app)
      .patch(`/api/v1/projects/${projectId}/sheets/${secondSheetId}`)
      .set('Cookie', customerCookie)
      .send({ inclusion: 'excluded', exclusionReason: 'Cover sheet' });
    expect(exclude.status).toBe(200);
    expect(exclude.body.sheet.inclusion).toBe('excluded');
    expect(exclude.body.sheet.exclusionReason).toBe('Cover sheet');

    const quote = await request(app)
      .get(`/api/v1/projects/${projectId}/quote`)
      .set('Cookie', customerCookie);
    expect(quote.status).toBe(200);
    expect(quote.body.quote.sheetCount).toBe(2);
    expect(quote.body.quote.includedSheets).toBe(1);
    expect(quote.body.quote.excludedSheets).toBe(1);
    expect(quote.body.quote.entitlement.allowed).toBe(true);
    expect(quote.body.quote.price.isFreeTrial).toBe(true);

    const manualScale = await request(app)
      .patch(`/api/v1/projects/${projectId}/sheets/${firstSheetId}`)
      .set('Cookie', customerCookie)
      .send({ scale: { denominator: 50 } });
    expect(manualScale.status).toBe(200);
    expect(manualScale.body.sheet.scale.status).toBe('user_provided');
    expect(manualScale.body.sheet.scale.ratio).toBe(50);
    expect(manualScale.body.sheet.scale.label).toBe('1:50');

    const image = await request(app)
      .get(`/api/v1/projects/${projectId}/sheets/${firstSheetId}/image`)
      .set('Cookie', customerCookie);
    expect(image.status).toBe(200);
    expect(image.body.url).toContain(`projects/${projectId}/floor_plan.pdf`);
    expect(image.body.pageNumber).toBe(1);

    const crossPatch = await request(app)
      .patch(`/api/v1/projects/${projectId}/sheets/${firstSheetId}`)
      .set('Cookie', otherCookie)
      .send({ inclusion: 'excluded' });
    expect(crossPatch.status).toBe(404);

    const invalidScale = await request(app)
      .patch(`/api/v1/projects/${projectId}/sheets/${firstSheetId}`)
      .set('Cookie', customerCookie)
      .send({ scale: { denominator: 0 } });
    expect(invalidScale.status).toBe(400);
  });

  it('blocks submission for pending inspection, missing scale, unreadable sheets and empty inclusion', async () => {
    const pendingProject = await createDraft('Pending project');
    await addFileWithSheets(pendingProject, [{}], 'ingesting');
    const pending = await request(app)
      .post(`/api/v1/projects/${pendingProject}/submit`)
      .set('Cookie', customerCookie);
    expect(pending.status).toBe(409);
    expect(pending.body.error.message).toMatch(/inspection/i);

    const missingScaleProject = await createDraft('Missing scale project');
    await addFileWithSheets(missingScaleProject, [{ scale: { status: 'missing' } }]);
    const missingScale = await request(app)
      .post(`/api/v1/projects/${missingScaleProject}/submit`)
      .set('Cookie', customerCookie);
    expect(missingScale.status).toBe(409);
    expect(missingScale.body.error.message).toMatch(/scale/i);

    const unreadableProject = await createDraft('Unreadable project');
    await addFileWithSheets(unreadableProject, [{ quality: 'unreadable' }]);
    const unreadable = await request(app)
      .post(`/api/v1/projects/${unreadableProject}/submit`)
      .set('Cookie', customerCookie);
    expect(unreadable.status).toBe(409);
    expect(unreadable.body.error.message).toMatch(/unreadable/i);

    const excludedProject = await createDraft('Excluded project');
    await addFileWithSheets(excludedProject, [{ inclusion: 'excluded' }]);
    const excluded = await request(app)
      .post(`/api/v1/projects/${excludedProject}/submit`)
      .set('Cookie', customerCookie);
    expect(excluded.status).toBe(409);
    expect(excluded.body.error.message).toMatch(/Include at least one sheet/i);

    const emptyProject = await createDraft('Empty project');
    const empty = await request(app)
      .post(`/api/v1/projects/${emptyProject}/submit`)
      .set('Cookie', customerCookie);
    expect(empty.status).toBe(409);
    expect(empty.body.error.message).toMatch(/inspect at least one drawing/i);
  });

  it('submits included sheets idempotently and exposes mapped progress', async () => {
    const projectId = await createDraft('Submittable project');
    await addFileWithSheets(projectId, [{}]);

    const submit = await request(app)
      .post(`/api/v1/projects/${projectId}/submit`)
      .set('Cookie', customerCookie);
    expect(submit.status).toBe(201);
    expect(submit.body.job.status).toBe('queued');
    expect(submit.body.job.sheetIds).toHaveLength(1);
    expect(submit.body.job.isTestData).toBe(true);
    const jobId: string = submit.body.job._id;

    const repeat = await request(app)
      .post(`/api/v1/projects/${projectId}/submit`)
      .set('Cookie', customerCookie);
    expect(repeat.status).toBe(200);
    expect(repeat.body.job._id).toBe(jobId);

    const status = await request(app)
      .get(`/api/v1/projects/${projectId}/status`)
      .set('Cookie', customerCookie);
    expect(status.status).toBe(200);
    expect(status.body.progress).toEqual({
      stage: 'processing',
      label: 'Processing drawings',
    });
    expect(status.body.job.sheetIds).toHaveLength(1);
    expect(status.body.targetDeadlineAt).toBeDefined();

    const [sheet] = await DrawingSheet.find({ projectId });
    const lockedPatch = await request(app)
      .patch(`/api/v1/projects/${projectId}/sheets/${sheet?._id.toString() ?? ''}`)
      .set('Cookie', customerCookie)
      .send({ inclusion: 'excluded' });
    expect(lockedPatch.status).toBe(409);

    const crossStatus = await request(app)
      .get(`/api/v1/projects/${projectId}/status`)
      .set('Cookie', otherCookie);
    expect(crossStatus.status).toBe(404);

    const project = await Project.findById(projectId);
    expect(project?.status).toBe('in_progress');
  });
});
