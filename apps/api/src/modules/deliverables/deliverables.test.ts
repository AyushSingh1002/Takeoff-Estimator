import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryObjectStorage } from '../../providers/storage';
import { AuditLog } from '../audit/audit.model';
import { claimNextJob, createJob, runNextStage } from '../jobs/job.service';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { QAReview } from '../review/qaReview.model';
import { approveJob, reviewBoqItem } from '../review/review.service';
import { BoqItem } from '../pipeline/boqItem.model';
import { Measurement } from '../pipeline/measurement.model';
import { DrawingFile, Project } from '../projects/project.model';
import { Deliverable } from './deliverable.model';
import {
  DELIVERABLE_TEMPLATE_VERSION,
  compileDeliverables,
  downloadDeliverable,
  listDeliveredBoq,
  listDeliverablesForProject,
} from './deliverable.service';
import { annotationRef } from './annotatedPdf';

describe('deliverables (M8)', () => {
  let mongoServer: MongoMemoryServer | undefined;
  let storage: InMemoryObjectStorage;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    process.env.MONGODB_URI = (await MongoMemoryServer.create()).getUri('takeoff_estimator_m8');
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
    storage = new InMemoryObjectStorage();
    await Promise.all([
      Deliverable.deleteMany({}),
      TakeoffJob.deleteMany({}),
      QAReview.deleteMany({}),
      BoqItem.deleteMany({}),
      Measurement.deleteMany({}),
      AuditLog.deleteMany({}),
      DrawingFile.deleteMany({}),
      Project.deleteMany({}),
    ]);
  });

  async function runApprovedJob(ownerId = 'cust-1'): Promise<{ jobId: string; projectId: string }> {
    const project = await Project.create({
      ownerId,
      name: 'Deliverable project',
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
    await createJob({ projectId, fileIds: [file._id.toString()], reason: 'initial' });
    const claimed = await claimNextJob();
    if (claimed === null) {
      throw new Error('Expected a claimed job');
    }
    const jobId = claimed._id.toString();
    for (let index = 0; index < 4; index += 1) {
      await runNextStage(jobId);
    }
    await QAReview.create({
      jobId,
      reviewerId: 'rev-1',
      kind: 'primary',
      status: 'assigned',
      assignedBy: 'admin-1',
    });
    await approveJob({ jobId, reviewerId: 'rev-1' });
    return { jobId, projectId };
  }

  it('compiles an approved job into a stored Excel workbook and annotated PDF', async () => {
    const { jobId } = await runApprovedJob();
    await expect(
      compileDeliverables({ jobId, actorId: 'rev-2', actorRole: 'reviewer', storage }),
    ).rejects.toThrow(/Reviewer not assigned/);
    const deliverables = await compileDeliverables({
      jobId,
      actorId: 'rev-1',
      actorRole: 'reviewer',
      storage,
    });

    expect(deliverables).toHaveLength(2);
    const types = deliverables.map((deliverable) => deliverable.type).sort();
    expect(types).toEqual(['annotated_pdf', 'boq_xlsx']);
    for (const deliverable of deliverables) {
      expect(deliverable.status).toBe('ready');
      expect(deliverable.version).toBe(1);
      expect(deliverable.isTestData).toBe(true);
      expect(deliverable.generatedBy).toBe(DELIVERABLE_TEMPLATE_VERSION);
      expect(deliverable.sha256).toMatch(/^[a-f0-9]{64}$/);
      const body = await storage.get(deliverable.storageKey);
      expect(body.length).toBe(deliverable.sizeBytes);
    }

    const workbookDeliverable = deliverables.find((item) => item.type === 'boq_xlsx');
    const pdfDeliverable = deliverables.find((item) => item.type === 'annotated_pdf');
    if (workbookDeliverable === undefined || pdfDeliverable === undefined) {
      throw new Error('Expected both deliverables');
    }
    const workbookBody = await storage.get(workbookDeliverable.storageKey);
    expect(workbookBody.subarray(0, 2).toString()).toBe('PK');
    const pdfBody = await storage.get(pdfDeliverable.storageKey);
    expect(pdfBody.subarray(0, 4).toString()).toBe('%PDF');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBody as unknown as ArrayBuffer);
    expect(workbook.getWorksheet('BOQ')).toBeDefined();
    expect(workbook.getWorksheet('Assumptions')).toBeDefined();
    expect(workbook.getWorksheet('Summary')).toBeDefined();
    const headers = workbook.getWorksheet('BOQ')?.getRow(1).values;
    expect(headers).toEqual([
      undefined,
      'Description',
      'Trade',
      'Quantity',
      'Unit',
      'Waste factor',
      'Adjusted quantity',
      'Assumptions',
      'Source drawing',
      'Sheet ref',
      'Review status',
    ]);

    const pdf = await PDFDocument.load(pdfBody);
    const measurements = await Measurement.find({ jobId });
    expect(pdf.getPageCount()).toBe(measurements.length);
  });

  it('keeps BOQ sheet refs aligned with the annotated PDF reference IDs', async () => {
    const { jobId } = await runApprovedJob();
    await compileDeliverables({ jobId, actorId: 'rev-1', actorRole: 'reviewer', storage });

    const measurements = await Measurement.find({ jobId });
    const measurementById = new Map(
      measurements.map((measurement) => [measurement._id.toString(), measurement]),
    );
    const annotationRefs = new Set(measurements.map((measurement) => annotationRef(measurement)));
    const boqItems = await BoqItem.find({ jobId });
    expect(boqItems.length).toBeGreaterThan(0);
    for (const item of boqItems) {
      expect(item.sheetRefs.length).toBeGreaterThan(0);
      for (const sheetRef of item.sheetRefs) {
        expect(annotationRefs.has(sheetRef)).toBe(true);
      }
      for (const measurementId of item.measurementIds) {
        const measurement = measurementById.get(measurementId);
        expect(measurement).toBeDefined();
        if (measurement !== undefined) {
          expect(item.sheetRefs).toContain(annotationRef(measurement));
        }
      }
    }
  });

  it('supersedes prior versions instead of overwriting them on re-compilation', async () => {
    const { jobId } = await runApprovedJob();
    const first = await compileDeliverables({
      jobId,
      actorId: 'rev-1',
      actorRole: 'reviewer',
      storage,
    });
    const second = await compileDeliverables({
      jobId,
      actorId: 'rev-1',
      actorRole: 'reviewer',
      storage,
    });

    for (const type of ['boq_xlsx', 'annotated_pdf'] as const) {
      const versions = await Deliverable.find({ jobId, type }).sort({ version: 1 });
      expect(versions).toHaveLength(2);
      expect(versions[0]?.version).toBe(1);
      expect(versions[0]?.status).toBe('superseded');
      expect(versions[1]?.version).toBe(2);
      expect(versions[1]?.status).toBe('ready');
      const firstOfType = first.find((item) => item.type === type);
      const secondOfType = second.find((item) => item.type === type);
      if (firstOfType === undefined || secondOfType === undefined) {
        throw new Error('Expected both versions');
      }
      expect(firstOfType.storageKey).not.toBe(secondOfType.storageKey);
      await expect(storage.get(firstOfType.storageKey)).resolves.toBeDefined();
      await expect(storage.get(secondOfType.storageKey)).resolves.toBeDefined();
    }

    const listed = await listDeliverablesForProject(first[0]?.projectId ?? '');
    expect(listed).toHaveLength(4);
  });

  it('only exposes the BOQ after a job has been delivered', async () => {
    const { jobId, projectId } = await runApprovedJob();
    await expect(listDeliveredBoq(projectId)).rejects.toThrow(/no delivered BOQ/);

    await compileDeliverables({ jobId, actorId: 'rev-1', actorRole: 'reviewer', storage });
    const items = await listDeliveredBoq(projectId);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.jobId).toBe(jobId);
    }
  });

  it('downloads only for the owning customer or an admin, and audit-logs each download', async () => {
    const { jobId, projectId } = await runApprovedJob('cust-1');
    const deliverables = await compileDeliverables({
      jobId,
      actorId: 'rev-1',
      actorRole: 'reviewer',
      storage,
    });
    const deliverable = deliverables[0];
    if (deliverable === undefined) {
      throw new Error('Expected a deliverable');
    }

    const ownerDownload = await downloadDeliverable({
      deliverableId: deliverable._id.toString(),
      actorId: 'cust-1',
      actorRole: 'customer',
      storage,
    });
    expect(ownerDownload.expiresIn).toBe(60);
    expect(ownerDownload.url).toContain(deliverable.storageKey);
    const audit = await AuditLog.findOne({
      entityType: 'Deliverable',
      entityId: deliverable._id.toString(),
      action: 'deliverable.download',
    });
    expect(audit).not.toBeNull();

    await expect(
      downloadDeliverable({
        deliverableId: deliverable._id.toString(),
        actorId: 'cust-2',
        actorRole: 'customer',
        storage,
      }),
    ).rejects.toThrow(/Deliverable not found/);

    await expect(
      downloadDeliverable({
        deliverableId: deliverable._id.toString(),
        actorId: 'rev-1',
        actorRole: 'reviewer',
        storage,
      }),
    ).rejects.toThrow(/Forbidden/);

    const adminDownload = await downloadDeliverable({
      deliverableId: deliverable._id.toString(),
      actorId: 'admin-1',
      actorRole: 'admin',
      storage,
    });
    expect(adminDownload.url).toContain(deliverable.storageKey);
    expect(deliverable.projectId).toBe(projectId);
  });

  it('records BOQ accept and reviewer override decisions with adjusted quantities', async () => {
    const { jobId } = await runApprovedJob();
    const items = await BoqItem.find({ jobId });
    const first = items[0];
    if (first === undefined) {
      throw new Error('Expected a BOQ item');
    }
    const accepted = await reviewBoqItem({
      jobId,
      itemId: first._id.toString(),
      reviewerId: 'rev-1',
      decision: 'accept',
    });
    expect(accepted.reviewStatus).toBe('accepted');

    const overrideValue = first.quantity * 2;
    const overridden = await reviewBoqItem({
      jobId,
      itemId: first._id.toString(),
      reviewerId: 'rev-1',
      decision: 'override',
      value: overrideValue,
      reason: 'Measured again on site',
    });
    expect(overridden.reviewStatus).toBe('corrected');
    expect(overridden.quantity).toBe(overrideValue);
    expect(overridden.adjustedQuantity).toBeCloseTo(
      overrideValue * (1 + overridden.wasteFactor),
      6,
    );
    expect(overridden.override?.reason).toBe('Measured again on site');

    await expect(
      reviewBoqItem({
        jobId,
        itemId: first._id.toString(),
        reviewerId: 'rev-2',
        decision: 'accept',
      }),
    ).rejects.toThrow(/Reviewer not assigned/);
  });
});
