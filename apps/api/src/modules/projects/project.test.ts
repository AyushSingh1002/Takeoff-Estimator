import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { InMemoryObjectStorage } from '../../providers/storage';
import { isMongoReady } from '../../db/mongo';
import { DrawingFile, Project } from './project.model';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { DetectedObject } from '../pipeline/detectedObject.model';
import { seedPricingPlans } from '../pricing/pricing.seed';

describe('projects + uploads (M2)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  let storage: InMemoryObjectStorage;
  let customerCookie: string;
  let customerId: string;
  let otherCookie: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m2');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
    storage = new InMemoryObjectStorage();
    app = createApp({
      storage,
      isMongoReady,
    });

    const registerResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'customer@example.com',
      password: 'supersecret123',
      name: 'Customer',
    });
    expect(registerResponse.status).toBe(201);
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'customer@example.com',
      password: 'supersecret123',
    });
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const firstSetCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    customerCookie = firstSetCookie?.split(';')[0] ?? '';
    const meResponse = await request(app).get('/api/v1/me').set('Cookie', customerCookie);
    customerId = meResponse.body.user.id;

    const otherRegisterResponse = await request(app).post('/api/v1/auth/register').send({
      email: 'other@example.com',
      password: 'supersecret123',
      name: 'Other',
    });
    expect(otherRegisterResponse.status).toBe(201);
    const otherLoginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'other@example.com',
      password: 'supersecret123',
    });
    const otherSetCookieHeader = otherLoginResponse.headers['set-cookie'];
    const otherFirstSetCookie = Array.isArray(otherSetCookieHeader)
      ? otherSetCookieHeader[0]
      : otherSetCookieHeader;
    otherCookie = otherFirstSetCookie?.split(';')[0] ?? '';
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('creates, lists and reads a customer project; other customers get 404', async () => {
    const createResponse = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerCookie)
      .send({ name: 'Villa blueprint' });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.project.status).toBe('draft');
    expect(createResponse.body.project.ownerId).toBe(customerId);
    projectId = createResponse.body.project._id;

    const listResponse = await request(app).get('/api/v1/projects').set('Cookie', customerCookie);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projects).toHaveLength(1);
    expect(listResponse.body.projects[0]?.id).toBe(projectId);

    const otherListResponse = await request(app).get('/api/v1/projects').set('Cookie', otherCookie);
    expect(otherListResponse.status).toBe(200);
    expect(otherListResponse.body.projects).toHaveLength(0);

    const otherGetResponse = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', otherCookie);
    expect(otherGetResponse.status).toBe(404);

    const getResponse = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerCookie);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.project.name).toBe('Villa blueprint');
  });

  it('edits a draft project and deletes it (delete-before-submit)', async () => {
    const patchResponse = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerCookie)
      .send({ name: 'Villa blueprint v2' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.project.name).toBe('Villa blueprint v2');

    const deleteResponse = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerCookie);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.ok).toBe(true);

    const getAfterDeleteResponse = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Cookie', customerCookie);
    expect(getAfterDeleteResponse.status).toBe(404);
  });

  it('validates uploads: oversize and unsupported content type are rejected', async () => {
    const createProjectResponse = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerCookie)
      .send({ name: 'Validation project' });
    expect(createProjectResponse.status).toBe(201);
    const validationProjectId = createProjectResponse.body.project._id;

    const oversizeResponse = await request(app)
      .post(`/api/v1/projects/${validationProjectId}/files`)
      .set('Cookie', customerCookie)
      .send({
        originalName: 'big.pdf',
        contentType: 'application/pdf',
        sizeBytes: 30 * 1024 * 1024,
      });
    expect(oversizeResponse.status).toBe(400);

    const badTypeResponse = await request(app)
      .post(`/api/v1/projects/${validationProjectId}/files`)
      .set('Cookie', customerCookie)
      .send({
        originalName: 'drawing.pdf',
        contentType: 'application/x-msdownload',
        sizeBytes: 1024,
      });
    expect(badTypeResponse.status).toBe(400);

    const pathTraversalResponse = await request(app)
      .post(`/api/v1/projects/${validationProjectId}/files`)
      .set('Cookie', customerCookie)
      .send({ originalName: '../evil.pdf', contentType: 'application/pdf', sizeBytes: 1024 });
    expect(pathTraversalResponse.status).toBe(400);
  });

  it('creates a presigned upload, completes it idempotently and deletes it', async () => {
    const createProjectResponse = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerCookie)
      .send({ name: 'Upload project' });
    expect(createProjectResponse.status).toBe(201);
    const uploadProjectId = createProjectResponse.body.project._id;
    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
    );

    const createUploadResponse = await request(app)
      .post(`/api/v1/projects/${uploadProjectId}/files`)
      .set('Cookie', customerCookie)
      .send({
        originalName: 'floor_plan.pdf',
        contentType: 'application/pdf',
        sizeBytes: pdfBytes.length,
      });
    expect(createUploadResponse.status).toBe(201);
    const fileId = createUploadResponse.body.fileId;
    expect(createUploadResponse.body.upload).toHaveProperty('url');
    expect(createUploadResponse.body.upload).toHaveProperty('fields');

    const filesResponse = await request(app)
      .get(`/api/v1/projects/${uploadProjectId}/files`)
      .set('Cookie', customerCookie);
    expect(filesResponse.status).toBe(200);
    expect(filesResponse.body.files).toHaveLength(1);
    const storageKey: string = filesResponse.body.files[0]?.storageKey ?? '';

    const completeMissingResponse = await request(app)
      .post(`/api/v1/projects/${uploadProjectId}/files/${fileId}/complete`)
      .set('Cookie', customerCookie);
    expect(completeMissingResponse.status).toBe(404);

    await storage.put(storageKey, pdfBytes, 'application/pdf');
    const completeResponse = await request(app)
      .post(`/api/v1/projects/${uploadProjectId}/files/${fileId}/complete`)
      .set('Cookie', customerCookie);
    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.file.status).toBe('uploaded');

    const completeAgainResponse = await request(app)
      .post(`/api/v1/projects/${uploadProjectId}/files/${fileId}/complete`)
      .set('Cookie', customerCookie);
    expect(completeAgainResponse.status).toBe(200);

    const sheet = await DrawingSheet.create({
      projectId: uploadProjectId,
      fileId,
      pageNumber: 1,
      sourceKind: 'vector_pdf',
      classification: 'floor_plan',
      classificationConfidence: 0.9,
      sheetType: 'floor_plan',
      quality: 'good',
      scale: { status: 'missing' },
    });
    await DetectedObject.create({
      projectId: uploadProjectId,
      jobId: 'draft-job',
      sheetId: sheet._id.toString(),
      class: 'wall',
      geometry: {
        kind: 'LineString',
        coordinates: [
          [0, 0],
          [10, 0],
        ],
      },
    });

    const deleteResponse = await request(app)
      .delete(`/api/v1/projects/${uploadProjectId}/files/${fileId}`)
      .set('Cookie', customerCookie);
    expect(deleteResponse.status).toBe(200);

    expect(await DrawingSheet.countDocuments({ projectId: uploadProjectId })).toBe(0);
    expect(await DetectedObject.countDocuments({ projectId: uploadProjectId })).toBe(0);

    const filesAfterDeleteResponse = await request(app)
      .get(`/api/v1/projects/${uploadProjectId}/files`)
      .set('Cookie', customerCookie);
    expect(filesAfterDeleteResponse.status).toBe(200);
    expect(filesAfterDeleteResponse.body.files).toHaveLength(0);
  });

  it('submits an ingested project and exposes its status to the owner only', async () => {
    await seedPricingPlans('test-seed');
    const createResponse = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerCookie)
      .send({ name: 'Submit project' });
    expect(createResponse.status).toBe(201);
    const submitProjectId = createResponse.body.project._id;

    const file = await DrawingFile.create({
      projectId: submitProjectId,
      originalName: 'submit.pdf',
      storageKey: `projects/${submitProjectId}/submit.pdf`,
      sizeBytes: 10,
      contentType: 'application/pdf',
      status: 'ingested',
      pageCount: 1,
    });
    await DrawingSheet.create({
      projectId: submitProjectId,
      fileId: file._id.toString(),
      pageNumber: 1,
      sourceKind: 'vector_pdf',
      classification: 'floor_plan',
      classificationConfidence: 0.9,
      widthPt: 842,
      heightPt: 595,
      scale: { status: 'detected', ratio: 0.01, source: 'fixture', confidence: 0.9 },
    });

    const submitResponse = await request(app)
      .post(`/api/v1/projects/${submitProjectId}/submit`)
      .set('Cookie', customerCookie);
    expect(submitResponse.status).toBe(201);
    expect(submitResponse.body.job.status).toBe('queued');

    const statusResponse = await request(app)
      .get(`/api/v1/projects/${submitProjectId}/status`)
      .set('Cookie', customerCookie);
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.job.projectId).toBe(submitProjectId);

    const crossStatus = await request(app)
      .get(`/api/v1/projects/${submitProjectId}/status`)
      .set('Cookie', otherCookie);
    expect(crossStatus.status).toBe(404);

    const project = await Project.findById(submitProjectId);
    expect(project?.status).toBe('in_progress');
  });

  it('cannot create uploads on another customer project', async () => {
    const createResponse = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', customerCookie)
      .send({ name: 'Other project' });
    expect(createResponse.status).toBe(201);
    const otherProjectId = createResponse.body.project._id;

    const crossResponse = await request(app)
      .post(`/api/v1/projects/${otherProjectId}/files`)
      .set('Cookie', otherCookie)
      .send({ originalName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1024 });
    expect(crossResponse.status).toBe(404);
  });
});
