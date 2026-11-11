import { randomBytes, randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { loadEnv } from '../../config/env';
import { Project, DrawingFile, type ProjectAttrs, type DrawingFileAttrs } from './project.model';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { DetectedObject } from '../pipeline/detectedObject.model';
import { createJob, getLatestJobByProject, type TakeoffJobDoc } from '../jobs/job.service';
import { quoteProjectForSubmit } from '../pricing/pricing.service';
import { User } from '../auth/auth.model';
import {
  UPLOAD_CONTENT_TYPES,
  type CreateProjectInput,
  type CreateUploadInput,
  type UpdateProjectInput,
} from './project.schemas';
import { validateDrawingFile } from './fileSecurity';
import type { ObjectStorage } from '../../providers/storage';

type ProjectDoc = HydratedDocument<ProjectAttrs>;
type DrawingFileDoc = HydratedDocument<DrawingFileAttrs>;

export interface ProjectSummary {
  id: string;
  ownerId: string;
  name: string;
  reference: string;
  regionPackCode: string;
  status: string;
  createdAt?: Date | undefined;
}

export interface FileSummary {
  id: string;
  projectId: string;
  originalName: string;
  storageKey: string;
  sizeBytes: number;
  contentType: string;
  sha256?: string;
  pageCount?: number;
  status: string;
  createdAt?: Date | undefined;
}

export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectDoc> {
  const reference = `TK-${randomBytes(4).toString('hex').toUpperCase()}`;
  const project = await Project.create({
    ownerId: userId,
    name: input.name ?? 'Untitled takeoff',
    reference,
    ...(input.location !== undefined ? { location: input.location } : {}),
    regionPackCode: input.regionPackCode ?? 'US',
    ...(input.tier !== undefined ? { tier: input.tier } : {}),
    status: 'draft',
  });
  return project;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const projects = await Project.find({ ownerId: userId, deletedAt: null }).sort({ createdAt: -1 });
  return projects.map((project) => ({
    id: project._id.toString(),
    ownerId: project.ownerId,
    name: project.name,
    reference: project.reference,
    regionPackCode: project.regionPackCode,
    status: project.status,
    createdAt: project.createdAt,
  }));
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDoc | null> {
  const project = await Project.findOne({ _id: projectId, ownerId: userId, deletedAt: null });
  return project;
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectDoc> {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  if (project.status !== 'draft') {
    throw new ApiError(409, 'CONFLICT', 'Project is not editable');
  }
  if (input.name !== undefined) {
    project.name = input.name;
  }
  if (input.regionPackCode !== undefined) {
    project.regionPackCode = input.regionPackCode;
  }
  if (input.tier !== undefined) {
    project.tier = input.tier;
  }
  if (input.location !== undefined) {
    project.location = input.location;
  }
  await project.save();
  return project;
}

export async function submitProject(
  userId: string,
  projectId: string,
): Promise<{ job: TakeoffJobDoc; created: boolean }> {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  if (project.status !== 'draft') {
    const existingJob = await getLatestJobByProject(projectId);
    if (existingJob !== null) {
      return { job: existingJob, created: false };
    }
    throw new ApiError(409, 'CONFLICT', 'Project is not submittable');
  }

  const [ingestedFiles, sheets, pendingFile] = await Promise.all([
    DrawingFile.find({ projectId, status: 'ingested' }),
    DrawingSheet.find({ projectId }),
    DrawingFile.exists({
      projectId,
      status: { $in: ['upload_pending', 'uploaded', 'ingesting'] },
    }),
  ]);
  if (pendingFile !== null) {
    throw new ApiError(409, 'CONFLICT', 'Wait for drawing inspection to finish before submitting');
  }
  if (ingestedFiles.length === 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      'Upload and inspect at least one drawing before submitting',
    );
  }

  const includedSheets = sheets.filter((sheet) => sheet.inclusion !== 'excluded');
  if (includedSheets.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'Include at least one sheet before submitting');
  }
  const unreadable = includedSheets.filter((sheet) => sheet.quality === 'unreadable');
  if (unreadable.length > 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      `${unreadable.length} included sheet(s) are unreadable; exclude them or upload a better drawing`,
    );
  }
  const unscaled = includedSheets.filter(
    (sheet) => sheet.scale.status === 'missing' || sheet.scale.status === 'conflicting',
  );
  if (unscaled.length > 0) {
    throw new ApiError(
      409,
      'CONFLICT',
      `${unscaled.length} included sheet(s) need a scale; enter it or exclude the sheet`,
    );
  }

  const quote = await quoteProjectForSubmit(userId, projectId);
  const job = await createJob({
    projectId,
    fileIds: ingestedFiles.map((file) => file._id.toString()),
    sheetIds: includedSheets.map((sheet) => sheet._id.toString()),
    reason: 'initial',
    priceQuote: quote.price,
    turnaroundHours: quote.targetTurnaroundHours,
  });
  if (quote.price.isFreeTrial) {
    await User.updateOne({ _id: userId, freeTrialUsedAt: null }, { freeTrialUsedAt: new Date() });
  }
  for (const file of ingestedFiles) {
    file.jobId = job._id.toString();
    await file.save();
  }
  project.status = 'in_progress';
  project.submittedAt = new Date();
  await project.save();
  return { job, created: true };
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  if (project.status !== 'draft') {
    throw new ApiError(409, 'CONFLICT', 'Project is not deletable');
  }
  project.deletedAt = new Date();
  await project.save();
}

export async function createUpload(
  storage: ObjectStorage,
  userId: string,
  projectId: string,
  input: CreateUploadInput,
): Promise<{ fileId: string; upload: { url: string; fields: Record<string, string> } }> {
  const env = loadEnv();
  if (input.sizeBytes > env.UPLOAD_MAX_BYTES) {
    throw new ApiError(
      400,
      'VALIDATION_FAILED',
      `File exceeds the maximum allowed size of ${env.UPLOAD_MAX_BYTES} bytes`,
    );
  }
  if (!UPLOAD_CONTENT_TYPES.includes(input.contentType as (typeof UPLOAD_CONTENT_TYPES)[number])) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Unsupported content type');
  }
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  const existingFiles = await DrawingFile.find({ projectId });
  if (existingFiles.length >= env.UPLOAD_MAX_FILES) {
    throw new ApiError(409, 'CONFLICT', 'Upload limit reached');
  }
  const file = await DrawingFile.create({
    projectId,
    originalName: input.originalName,
    storageKey: `projects/${projectId}/files/${randomUUID()}`,
    sizeBytes: input.sizeBytes,
    contentType: input.contentType,
    status: 'upload_pending',
  });
  const upload = await storage.presignPost({
    key: file.storageKey,
    contentType: file.contentType,
    contentLength: file.sizeBytes,
  });
  const fileId = file._id.toString();
  return { fileId, upload: { url: upload.url, fields: upload.fields } };
}

export async function completeUpload(
  storage: ObjectStorage,
  userId: string,
  projectId: string,
  fileId: string,
): Promise<DrawingFileDoc> {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  const files = await DrawingFile.find({ projectId });
  const file = files.find((candidate) => candidate._id.toString() === fileId);
  if (file === undefined) {
    throw new ApiError(404, 'NOT_FOUND', 'File not found');
  }
  if (file.status === 'uploaded') {
    return file;
  }
  const body = await storage.get(file.storageKey).catch(() => {
    throw new ApiError(404, 'NOT_FOUND', 'File not found');
  });
  if (body.length !== file.sizeBytes) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'File size mismatch');
  }
  validateDrawingFile({
    body,
    declaredContentType: file.contentType,
    maxPages: loadEnv().INGEST_MAX_PAGES,
  });
  const sha256 = createHash('sha256').update(body).digest('hex');
  file.sha256 = sha256;
  file.status = 'uploaded';
  await file.save();
  return file;
}

export async function deleteUpload(
  storage: ObjectStorage,
  userId: string,
  projectId: string,
  fileId: string,
): Promise<void> {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  if (project.status !== 'draft') {
    throw new ApiError(409, 'CONFLICT', 'Files can only be deleted while the project is a draft');
  }
  const files = await DrawingFile.find({ projectId });
  const file = files.find((candidate) => candidate._id.toString() === fileId);
  if (file === undefined) {
    throw new ApiError(404, 'NOT_FOUND', 'File not found');
  }
  const sheets = await DrawingSheet.find({ projectId, fileId }).select('_id');
  const sheetIds = sheets.map((sheet) => sheet._id.toString());
  await storage.delete(file.storageKey);
  // API_SPECIFICATION: deleting a draft file also drops its sheets and any
  // objects detected on them, so they can never reach a takeoff snapshot.
  await Promise.all([
    DrawingSheet.deleteMany({ projectId, fileId }),
    DetectedObject.deleteMany({ projectId, sheetId: { $in: sheetIds } }),
    DrawingFile.deleteOne({ _id: file._id }),
  ]);
}

export async function listFiles(userId: string, projectId: string): Promise<FileSummary[]> {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  const files = await DrawingFile.find({ projectId });
  return files.map((file) => ({
    id: file._id.toString(),
    projectId: file.projectId,
    originalName: file.originalName,
    storageKey: file.storageKey,
    sizeBytes: file.sizeBytes,
    contentType: file.contentType,
    ...(file.sha256 === undefined ? {} : { sha256: file.sha256 }),
    ...(file.pageCount === undefined ? {} : { pageCount: file.pageCount }),
    status: file.status,
    createdAt: file.createdAt,
  }));
}
