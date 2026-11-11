import { HydratedDocument, isValidObjectId } from 'mongoose';
import { loadEnv } from '../../config/env';
import { ApiError } from '../../errors/ApiError';
import type { ObjectStorage } from '../../providers/storage';
import { writeAudit } from '../audit/audit.service';
import { compileDeliverables } from '../deliverables/deliverable.service';
import {
  DrawingSheet,
  type DrawingSheetAttrs,
  type SheetScale,
} from '../ingestion/drawingSheet.model';
import { sheetRefFor } from '../ingestion/sheetRef';
import { BoqItem, type BoqItemAttrs } from '../pipeline/boqItem.model';
import {
  DetectedObject,
  type DetectedObjectAttrs,
  type DetectedObjectGeometry,
} from '../pipeline/detectedObject.model';
import { Discrepancy, type DiscrepancyAttrs } from '../pipeline/discrepancy.model';
import { Measurement, type MeasurementAttrs } from '../pipeline/measurement.model';
import { DrawingFile, Project } from '../projects/project.model';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { TakeoffJobDoc } from '../jobs/job.service';
import { QAReview, type QAReviewAttrs, type QAReviewStatus } from './qaReview.model';

type QAReviewDoc = HydratedDocument<QAReviewAttrs>;
type BoqItemDoc = HydratedDocument<BoqItemAttrs>;
type DiscrepancyDoc = HydratedDocument<DiscrepancyAttrs>;
type MeasurementDoc = HydratedDocument<MeasurementAttrs>;
type DetectedObjectDoc = HydratedDocument<DetectedObjectAttrs>;
type DrawingSheetDoc = HydratedDocument<DrawingSheetAttrs>;

export interface ReviewCounts {
  objects: number;
  measurements: number;
  boqItems: number;
  openDiscrepancies: number;
  blockingDiscrepancies: number;
  sheets: number;
}

export interface ReviewJobSummary {
  job: TakeoffJobDoc;
  projectReference?: string;
  counts: ReviewCounts;
}

export interface ReviewJobDetail {
  job: TakeoffJobDoc;
  projectReference?: string;
  reviewStatus: QAReviewStatus;
  counts: ReviewCounts;
}

export interface ReviewSheetSummary {
  id: string;
  sheetRef: string;
  projectId: string;
  fileId: string;
  fileName?: string;
  pageNumber: number;
  sheetNumber?: string;
  title?: string;
  classification: string;
  classificationConfidence: number;
  discipline: string;
  sheetType: string;
  quality: string;
  qualityReasons: string[];
  widthPt?: number;
  heightPt?: number;
  scale: SheetScale;
  inclusion: string;
  exclusionReason?: string;
  objectCount: number;
  measurementCount: number;
  openDiscrepancies: number;
  blockingDiscrepancies: number;
  hasImage: boolean;
}

export interface ReviewSheetDetail {
  sheet: ReviewSheetSummary;
  image: { url: string; expiresIn: number; contentType: string };
  objects: DetectedObjectDoc[];
  measurements: MeasurementDoc[];
  discrepancies: DiscrepancyDoc[];
}

interface ReviewData {
  objects: DetectedObjectDoc[];
  measurements: MeasurementDoc[];
  boqItems: BoqItemDoc[];
  discrepancies: DiscrepancyDoc[];
}

async function requireAssignedReviewer(jobId: string, reviewerId: string): Promise<QAReviewDoc> {
  const review = await QAReview.findOne({ jobId, reviewerId });
  if (review === null) {
    throw new ApiError(403, 'FORBIDDEN', 'Reviewer not assigned');
  }
  return review;
}

async function requireJob(jobId: string): Promise<TakeoffJobDoc> {
  const job = await TakeoffJob.findById(jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  return job;
}

async function projectReferenceFor(projectId: string): Promise<string | undefined> {
  if (!isValidObjectId(projectId)) {
    return undefined;
  }
  const project = await Project.findById(projectId).select('reference');
  return project?.reference;
}

async function collectReviewData(jobId: string): Promise<ReviewData> {
  const [objects, measurements, boqItems, discrepancies] = await Promise.all([
    DetectedObject.find({ jobId }),
    Measurement.find({ jobId }),
    BoqItem.find({ jobId }),
    Discrepancy.find({ jobId }),
  ]);
  return { objects, measurements, boqItems, discrepancies };
}

function countSheets(job: TakeoffJobDoc, data: ReviewData): number {
  if (job.sheetIds.length > 0) {
    return job.sheetIds.length;
  }
  const refs = new Set<string>();
  for (const item of [...data.objects, ...data.measurements, ...data.discrepancies]) {
    if (item.sheetId !== undefined) {
      refs.add(item.sheetId);
    }
  }
  return refs.size;
}

function toCounts(job: TakeoffJobDoc, data: ReviewData): ReviewCounts {
  return {
    objects: data.objects.length,
    measurements: data.measurements.length,
    boqItems: data.boqItems.length,
    openDiscrepancies: data.discrepancies.filter((discrepancy) => discrepancy.status === 'open')
      .length,
    blockingDiscrepancies: data.discrepancies.filter(
      (discrepancy) => discrepancy.status === 'open' && discrepancy.severity === 'blocking',
    ).length,
    sheets: countSheets(job, data),
  };
}

async function markReviewStarted(job: TakeoffJobDoc, review: QAReviewDoc): Promise<void> {
  let changed = false;
  const previousStatus = job.status;
  if (job.status === 'awaiting_review') {
    job.status = 'in_review';
    await job.save();
    changed = true;
  }
  if (review.status === 'assigned') {
    review.status = 'in_progress';
    if (review.startedAt === undefined) {
      review.startedAt = new Date();
    }
    await review.save();
    changed = true;
  }
  if (changed) {
    await writeAudit({
      actorId: review.reviewerId,
      actorRole: 'reviewer',
      action: 'job.review.start',
      entityType: 'TakeoffJob',
      entityId: job._id.toString(),
      projectId: job.projectId,
      before: { status: previousStatus },
      after: { status: job.status },
    });
  }
}

export async function listAssignedJobs(reviewerId: string): Promise<ReviewJobSummary[]> {
  const reviews = await QAReview.find({ reviewerId, status: { $in: ['assigned', 'in_progress'] } });
  const jobIds = reviews.map((review) => review.jobId);
  if (jobIds.length === 0) {
    return [];
  }
  const jobs = await TakeoffJob.find({ _id: { $in: jobIds } }).sort({ 'sla.deadlineAt': 1 });
  return Promise.all(
    jobs.map(async (job) => {
      const [data, projectReference] = await Promise.all([
        collectReviewData(job._id.toString()),
        projectReferenceFor(job.projectId),
      ]);
      return {
        job,
        ...(projectReference === undefined ? {} : { projectReference }),
        counts: toCounts(job, data),
      };
    }),
  );
}

export async function getJobDetail(jobId: string, reviewerId: string): Promise<ReviewJobDetail> {
  const review = await requireAssignedReviewer(jobId, reviewerId);
  const job = await requireJob(jobId);
  const [data, projectReference] = await Promise.all([
    collectReviewData(jobId),
    projectReferenceFor(job.projectId),
  ]);
  await markReviewStarted(job, review);
  return {
    job,
    ...(projectReference === undefined ? {} : { projectReference }),
    reviewStatus: review.status,
    counts: toCounts(job, data),
  };
}

function parseSheetRef(ref: string): { fileId: string; pageNumber: number } | null {
  const parts = ref.split(':');
  if (parts.length !== 3 || parts[0] !== 'sheet') {
    return null;
  }
  const fileId = parts[1];
  const pageNumber = Number(parts[2]);
  if (fileId === undefined || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return null;
  }
  return { fileId, pageNumber };
}

function sheetSummary(input: {
  job: TakeoffJobDoc;
  sheet: DrawingSheetDoc | null;
  sheetRef: string;
  fileId: string;
  pageNumber: number;
  fileName?: string;
  objects: DetectedObjectDoc[];
  measurements: MeasurementDoc[];
  discrepancies: DiscrepancyDoc[];
  hasFile: boolean;
}): ReviewSheetSummary {
  const { sheet } = input;
  const openDiscrepancies = input.discrepancies.filter(
    (discrepancy) => discrepancy.sheetId === input.sheetRef && discrepancy.status === 'open',
  );
  const base = {
    id: sheet?._id.toString() ?? input.sheetRef,
    sheetRef: input.sheetRef,
    projectId: input.job.projectId,
    fileId: input.fileId,
    ...(input.fileName === undefined ? {} : { fileName: input.fileName }),
    pageNumber: input.pageNumber,
    objectCount: input.objects.filter((object) => object.sheetId === input.sheetRef).length,
    measurementCount: input.measurements.filter(
      (measurement) => measurement.sheetId === input.sheetRef,
    ).length,
    openDiscrepancies: openDiscrepancies.length,
    blockingDiscrepancies: openDiscrepancies.filter(
      (discrepancy) => discrepancy.severity === 'blocking',
    ).length,
    hasImage: sheet?.pageImageKey !== undefined || input.hasFile,
  };
  if (sheet === null) {
    return {
      ...base,
      classification: 'unknown',
      classificationConfidence: 0,
      discipline: 'unknown',
      sheetType: 'unknown',
      quality: 'good',
      qualityReasons: [],
      scale: { status: 'missing' },
      inclusion: 'included',
    };
  }
  return {
    ...base,
    pageNumber: sheet.pageNumber,
    ...(sheet.sheetNumber === undefined ? {} : { sheetNumber: sheet.sheetNumber }),
    ...(sheet.title === undefined ? {} : { title: sheet.title }),
    classification: sheet.classification,
    classificationConfidence: sheet.classificationConfidence,
    discipline: sheet.discipline,
    sheetType: sheet.sheetType,
    quality: sheet.quality,
    qualityReasons: sheet.qualityReasons,
    ...(sheet.widthPt === undefined ? {} : { widthPt: sheet.widthPt }),
    ...(sheet.heightPt === undefined ? {} : { heightPt: sheet.heightPt }),
    scale: sheet.scale,
    inclusion: sheet.inclusion,
    ...(sheet.exclusionReason === undefined ? {} : { exclusionReason: sheet.exclusionReason }),
  };
}

export async function listReviewSheets(
  jobId: string,
  reviewerId: string,
): Promise<ReviewSheetSummary[]> {
  await requireAssignedReviewer(jobId, reviewerId);
  const job = await requireJob(jobId);
  const sheetQuery =
    job.sheetIds.length > 0 ? { _id: { $in: job.sheetIds } } : { projectId: job.projectId };
  const [data, sheetDocs, files] = await Promise.all([
    collectReviewData(jobId),
    DrawingSheet.find(sheetQuery),
    DrawingFile.find({ _id: { $in: job.fileIds } }).select('_id originalName'),
  ]);
  const fileNames = new Map(files.map((file) => [file._id.toString(), file.originalName]));
  const docsByRef = new Map(
    sheetDocs.map((sheet) => [sheetRefFor(sheet.fileId, sheet.pageNumber), sheet]),
  );
  const refs = new Set<string>();
  for (const sheet of sheetDocs) {
    refs.add(sheetRefFor(sheet.fileId, sheet.pageNumber));
  }
  if (job.sheetIds.length === 0) {
    for (const item of [...data.objects, ...data.measurements, ...data.discrepancies]) {
      if (item.sheetId !== undefined) {
        refs.add(item.sheetId);
      }
    }
  }

  const summaries: ReviewSheetSummary[] = [];
  for (const ref of refs) {
    const parsed = parseSheetRef(ref);
    if (parsed === null) {
      continue;
    }
    const sheet = docsByRef.get(ref) ?? null;
    const fileId = sheet?.fileId ?? parsed.fileId;
    const pageNumber = sheet?.pageNumber ?? parsed.pageNumber;
    const fileName = fileNames.get(fileId);
    summaries.push(
      sheetSummary({
        job,
        sheet,
        sheetRef: ref,
        fileId,
        pageNumber,
        ...(fileName === undefined ? {} : { fileName }),
        objects: data.objects,
        measurements: data.measurements,
        discrepancies: data.discrepancies,
        hasFile: files.some((file) => file._id.toString() === fileId),
      }),
    );
  }
  return summaries.sort((left, right) =>
    left.sheetRef.localeCompare(right.sheetRef, undefined, { numeric: true }),
  );
}

export async function getReviewSheetDetail(
  storage: ObjectStorage,
  jobId: string,
  sheetIdOrRef: string,
  reviewerId: string,
): Promise<ReviewSheetDetail> {
  await requireAssignedReviewer(jobId, reviewerId);
  const job = await requireJob(jobId);

  let sheet: DrawingSheetDoc | null = null;
  if (isValidObjectId(sheetIdOrRef)) {
    sheet = await DrawingSheet.findOne({ _id: sheetIdOrRef, projectId: job.projectId });
  }
  let ref =
    sheet === null
      ? sheetIdOrRef.startsWith('sheet:')
        ? sheetIdOrRef
        : null
      : sheetRefFor(sheet.fileId, sheet.pageNumber);
  if (ref === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Sheet not found');
  }
  const parsed = parseSheetRef(ref);
  if (parsed === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Sheet not found');
  }
  if (sheet === null) {
    sheet = await DrawingSheet.findOne({
      projectId: job.projectId,
      fileId: parsed.fileId,
      pageNumber: parsed.pageNumber,
    });
    if (sheet !== null) {
      ref = sheetRefFor(sheet.fileId, sheet.pageNumber);
    }
  }
  if (sheet !== null && job.sheetIds.length > 0 && !job.sheetIds.includes(sheet._id.toString())) {
    throw new ApiError(404, 'NOT_FOUND', 'Sheet not found');
  }

  const fileId = sheet?.fileId ?? parsed.fileId;
  const pageNumber = sheet?.pageNumber ?? parsed.pageNumber;
  if (!isValidObjectId(fileId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Sheet not found');
  }
  const [file, objects, measurements, discrepancies] = await Promise.all([
    DrawingFile.findOne({ _id: fileId, projectId: job.projectId }).select(
      '_id originalName storageKey contentType',
    ),
    DetectedObject.find({ jobId, sheetId: ref }),
    Measurement.find({ jobId, sheetId: ref }),
    Discrepancy.find({ jobId, sheetId: ref }),
  ]);
  if (file === null || !job.fileIds.includes(file._id.toString())) {
    throw new ApiError(404, 'NOT_FOUND', 'Sheet not found');
  }
  const key = sheet?.pageImageKey ?? file.storageKey;
  const env = loadEnv();
  const url = await storage.presignGet(key, env.SIGNED_URL_TTL_SECONDS);
  return {
    sheet: sheetSummary({
      job,
      sheet,
      sheetRef: ref,
      fileId,
      pageNumber,
      fileName: file.originalName,
      objects,
      measurements,
      discrepancies,
      hasFile: true,
    }),
    image: { url, expiresIn: env.SIGNED_URL_TTL_SECONDS, contentType: file.contentType },
    objects,
    measurements,
    discrepancies,
  };
}

export async function listBoqItems(jobId: string, reviewerId: string): Promise<BoqItemDoc[]> {
  await requireAssignedReviewer(jobId, reviewerId);
  return BoqItem.find({ jobId });
}

export async function listDiscrepancies(
  jobId: string,
  reviewerId: string,
  filters?: { status?: string | undefined; severity?: string | undefined },
): Promise<DiscrepancyDoc[]> {
  await requireAssignedReviewer(jobId, reviewerId);
  const query: Record<string, unknown> = { jobId };
  if (filters?.status !== undefined) {
    query.status = filters.status;
  }
  if (filters?.severity !== undefined) {
    query.severity = filters.severity;
  }
  return Discrepancy.find(query);
}

export async function updateMeasurement(input: {
  jobId: string;
  measurementId: string;
  reviewerId: string;
  value?: number | undefined;
  geometry?: DetectedObjectGeometry | undefined;
  note: string;
}): Promise<MeasurementDoc> {
  await requireAssignedReviewer(input.jobId, input.reviewerId);
  const job = await requireJob(input.jobId);
  if (input.value === undefined && input.geometry === undefined) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'A value or geometry change is required');
  }
  const measurement = await Measurement.findOne({
    _id: input.measurementId,
    jobId: input.jobId,
  });
  if (measurement === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Measurement not found');
  }
  const before = measurement.toObject();
  if (input.value !== undefined) {
    measurement.value = input.value;
  }
  if (input.geometry !== undefined) {
    measurement.geometry = input.geometry;
  }
  await measurement.save();
  if (input.value !== undefined) {
    const boqItems = await BoqItem.find({ measurementIds: measurement._id.toString() });
    for (const boqItem of boqItems) {
      boqItem.quantity = input.value;
      boqItem.adjustedQuantity = input.value * (1 + boqItem.wasteFactor);
      boqItem.measurementIds = [measurement._id.toString()];
      await boqItem.save();
    }
  }
  await writeAudit({
    actorId: input.reviewerId,
    actorRole: 'reviewer',
    action: 'measurement.edit',
    entityType: 'Measurement',
    entityId: measurement._id.toString(),
    projectId: job.projectId,
    before,
    after: { ...measurement.toObject(), value: measurement.value },
    note: input.note,
  });
  return measurement;
}

export async function addManualMeasurement(input: {
  jobId: string;
  reviewerId: string;
  type: 'length' | 'area' | 'volume' | 'count';
  value: number;
  unit: 'm' | 'm2' | 'm3' | 'count';
  note: string;
}): Promise<MeasurementDoc> {
  await requireAssignedReviewer(input.jobId, input.reviewerId);
  const job = await requireJob(input.jobId);
  const measurement = await Measurement.create({
    projectId: job.projectId,
    jobId: job._id.toString(),
    type: input.type,
    value: input.value,
    unit: input.unit,
    method: 'manual_reviewer',
    confidence: 1,
    sourceAnnotation: `manual:${input.reviewerId}`,
  });
  await writeAudit({
    actorId: input.reviewerId,
    actorRole: 'reviewer',
    action: 'measurement.create',
    entityType: 'Measurement',
    entityId: measurement._id.toString(),
    projectId: job.projectId,
    after: { ...measurement.toObject(), value: measurement.value },
    note: input.note,
  });
  return measurement;
}

export async function reviewBoqItem(input: {
  jobId: string;
  itemId: string;
  reviewerId: string;
  decision: 'accept' | 'override';
  value?: number | undefined;
  reason?: string | undefined;
}): Promise<BoqItemDoc> {
  await requireAssignedReviewer(input.jobId, input.reviewerId);
  const item = await BoqItem.findOne({ _id: input.itemId, jobId: input.jobId });
  if (item === null) {
    throw new ApiError(404, 'NOT_FOUND', 'BOQ item not found');
  }
  const before = {
    quantity: item.quantity,
    adjustedQuantity: item.adjustedQuantity,
    reviewStatus: item.reviewStatus,
  };
  if (input.decision === 'accept') {
    item.reviewStatus = 'accepted';
  } else {
    if (
      input.value === undefined ||
      input.reason === undefined ||
      input.reason.trim().length === 0
    ) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Override requires value and reason');
    }
    item.reviewStatus = 'corrected';
    item.override = { value: input.value, reason: input.reason };
    item.quantity = input.value;
    item.adjustedQuantity = input.value * (1 + item.wasteFactor);
  }
  await item.save();
  await writeAudit({
    actorId: input.reviewerId,
    actorRole: 'reviewer',
    action: input.decision === 'accept' ? 'boq.accept' : 'boq.override',
    entityType: 'BOQItem',
    entityId: item._id.toString(),
    projectId: item.projectId,
    before,
    after: {
      quantity: item.quantity,
      adjustedQuantity: item.adjustedQuantity,
      reviewStatus: item.reviewStatus,
      override: item.override ?? null,
    },
    note: input.reason ?? 'Reviewer accepted BOQ item',
  });
  return item;
}

export async function resolveDiscrepancy(input: {
  jobId: string;
  discrepancyId: string;
  reviewerId: string;
  decision: 'resolve' | 'dismiss';
  note: string;
}): Promise<DiscrepancyDoc> {
  await requireAssignedReviewer(input.jobId, input.reviewerId);
  const job = await requireJob(input.jobId);
  const discrepancy = await Discrepancy.findOne({
    _id: input.discrepancyId,
    jobId: input.jobId,
  });
  if (discrepancy === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Discrepancy not found');
  }
  const before = { status: discrepancy.status, note: discrepancy.note };
  const nextStatus = input.decision === 'resolve' ? 'resolved' : 'dismissed';
  discrepancy.status = nextStatus;
  discrepancy.note = input.note;
  await discrepancy.save();
  await writeAudit({
    actorId: input.reviewerId,
    actorRole: 'reviewer',
    action: input.decision === 'resolve' ? 'discrepancy.resolve' : 'discrepancy.dismiss',
    entityType: 'Discrepancy',
    entityId: discrepancy._id.toString(),
    projectId: job.projectId,
    before,
    after: { status: nextStatus, note: input.note },
    note: input.note,
  });
  return discrepancy;
}

export async function approveJob(input: {
  jobId: string;
  reviewerId: string;
}): Promise<TakeoffJobDoc> {
  await requireAssignedReviewer(input.jobId, input.reviewerId);
  const job = await requireJob(input.jobId);
  if (job.status !== 'awaiting_review' && job.status !== 'in_review') {
    throw new ApiError(409, 'CONFLICT', 'Job is not awaiting review');
  }
  const previousStatus = job.status;
  const blocking = await Discrepancy.findOne({
    jobId: input.jobId,
    status: 'open',
    severity: 'blocking',
  });
  if (blocking !== null) {
    throw new ApiError(409, 'CONFLICT', 'Blocking discrepancies open');
  }
  job.status = 'approved';
  job.sla.qaCompletedAt = new Date();
  await job.save();
  const review = await QAReview.findOneAndUpdate(
    { jobId: input.jobId, reviewerId: input.reviewerId },
    { status: 'approved' as QAReviewStatus, submittedAt: new Date() },
    { new: true },
  );
  if (review === null) {
    throw new ApiError(404, 'NOT_FOUND', 'QAReview not found');
  }
  await writeAudit({
    actorId: input.reviewerId,
    actorRole: 'reviewer',
    action: 'job.approve',
    entityType: 'TakeoffJob',
    entityId: input.jobId,
    projectId: job.projectId,
    before: { status: previousStatus },
    after: { status: job.status },
  });
  return job;
}

/**
 * Compilation is attempted inside the approval request per USER_FLOWS §2. A
 * failure must not undo the approval: the job stays `approved` so delivery can
 * be retried through POST /jobs/:jobId/deliver.
 */
export class DeliverableCompilationError extends Error {
  constructor(
    readonly jobId: string,
    override readonly cause: unknown,
  ) {
    super('Deliverables could not be compiled');
    this.name = 'DeliverableCompilationError';
  }
}

export async function approveJobAndDeliver(input: {
  jobId: string;
  reviewerId: string;
  storage: Pick<ObjectStorage, 'put'>;
}): Promise<TakeoffJobDoc> {
  await approveJob({ jobId: input.jobId, reviewerId: input.reviewerId });
  try {
    await compileDeliverables({
      jobId: input.jobId,
      actorId: input.reviewerId,
      actorRole: 'reviewer',
      storage: input.storage,
    });
  } catch (error: unknown) {
    throw new DeliverableCompilationError(input.jobId, error);
  }
  const job = await TakeoffJob.findById(input.jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  return job;
}

export async function rejectJob(input: {
  jobId: string;
  reviewerId: string;
  reason: string;
}): Promise<TakeoffJobDoc> {
  await requireAssignedReviewer(input.jobId, input.reviewerId);
  const job = await requireJob(input.jobId);
  if (job.status !== 'awaiting_review' && job.status !== 'in_review') {
    throw new ApiError(409, 'CONFLICT', 'Job is not awaiting review');
  }
  const previousStatus = job.status;
  if (input.reason.trim().length === 0) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Rejection reason required');
  }
  job.status = 'review_rejected';
  await job.save();
  const review = await QAReview.findOneAndUpdate(
    { jobId: input.jobId, reviewerId: input.reviewerId },
    { status: 'rejected' as QAReviewStatus, submittedAt: new Date(), notes: input.reason },
    { new: true },
  );
  if (review === null) {
    throw new ApiError(404, 'NOT_FOUND', 'QAReview not found');
  }
  await writeAudit({
    actorId: input.reviewerId,
    actorRole: 'reviewer',
    action: 'job.reject',
    entityType: 'TakeoffJob',
    entityId: input.jobId,
    projectId: job.projectId,
    before: { status: previousStatus },
    after: { status: job.status },
    note: input.reason,
  });
  return job;
}

export async function assignReviewer(input: {
  jobId: string;
  reviewerId: string;
  assignedBy: string;
  kind?: 'primary' | 'second_review';
}): Promise<QAReviewDoc> {
  const job = await requireJob(input.jobId);
  const review = await QAReview.findOneAndUpdate(
    { jobId: input.jobId, reviewerId: input.reviewerId },
    {
      kind: input.kind ?? 'primary',
      status: 'assigned',
      assignedBy: input.assignedBy,
      startedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (review === null) {
    throw new ApiError(404, 'NOT_FOUND', 'QAReview not found');
  }
  await writeAudit({
    actorId: input.assignedBy,
    actorRole: 'admin',
    action: 'job.assign',
    entityType: 'QAReview',
    entityId: input.jobId,
    projectId: job.projectId,
    after: { reviewerId: input.reviewerId, status: 'assigned' },
  });
  return review;
}
