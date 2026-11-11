import type { HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { loadEnv } from '../../config/env';
import type { ObjectStorage } from '../../providers/storage';
import {
  DrawingSheet,
  type DrawingSheetAttrs,
  type SheetDiscipline,
  type SheetInclusion,
  type SheetQuality,
  type SheetScale,
} from '../ingestion/drawingSheet.model';
import { DrawingFile } from './project.model';
import { getProject } from './project.service';
import type { UpdateSheetInput } from './project.schemas';

type SheetDoc = HydratedDocument<DrawingSheetAttrs>;

export interface SheetSummary {
  id: string;
  projectId: string;
  fileId: string;
  fileName?: string;
  pageNumber: number;
  sourceKind: string;
  sheetNumber?: string;
  title?: string;
  classification: string;
  classificationConfidence: number;
  discipline: SheetDiscipline;
  sheetType: string;
  quality: SheetQuality;
  qualityReasons: string[];
  widthPt?: number;
  heightPt?: number;
  scale: SheetScale;
  inclusion: SheetInclusion;
  exclusionReason?: string;
}

function toSummary(sheet: SheetDoc, fileName?: string): SheetSummary {
  return {
    id: sheet._id.toString(),
    projectId: sheet.projectId,
    fileId: sheet.fileId,
    ...(fileName === undefined ? {} : { fileName }),
    pageNumber: sheet.pageNumber,
    sourceKind: sheet.sourceKind,
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

async function getProjectOrThrow(userId: string, projectId: string) {
  const project = await getProject(userId, projectId);
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  return project;
}

async function getSheetOrThrow(projectId: string, sheetId: string): Promise<SheetDoc> {
  const sheet = await DrawingSheet.findOne({ _id: sheetId, projectId });
  if (sheet === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Sheet not found');
  }
  return sheet;
}

export async function listSheets(userId: string, projectId: string): Promise<SheetSummary[]> {
  await getProjectOrThrow(userId, projectId);
  const [sheets, files] = await Promise.all([
    DrawingSheet.find({ projectId }).sort({ fileId: 1, pageNumber: 1 }),
    DrawingFile.find({ projectId }).select('_id originalName'),
  ]);
  const names = new Map(files.map((file) => [file._id.toString(), file.originalName]));
  return sheets.map((sheet) => toSummary(sheet, names.get(sheet.fileId)));
}

export async function updateSheet(
  userId: string,
  projectId: string,
  sheetId: string,
  input: UpdateSheetInput,
): Promise<SheetSummary> {
  const project = await getProjectOrThrow(userId, projectId);
  if (project.status !== 'draft') {
    throw new ApiError(409, 'CONFLICT', 'Sheets can only be edited while the project is a draft');
  }
  const sheet = await getSheetOrThrow(projectId, sheetId);

  if (input.inclusion !== undefined) {
    sheet.inclusion = input.inclusion;
    if (input.inclusion === 'excluded') {
      sheet.exclusionReason = input.exclusionReason ?? 'excluded_by_customer';
    } else {
      sheet.exclusionReason = undefined;
    }
  }

  if (input.scale !== undefined) {
    const denominator = input.scale.denominator;
    sheet.scale = {
      status: 'user_provided',
      label: `1:${Number.isInteger(denominator) ? denominator : Number(denominator.toFixed(2))}`,
      ratio: denominator,
      source: 'customer',
      confidence: 1,
    };
  }

  await sheet.save();
  const file = await DrawingFile.findById(sheet.fileId).select('_id originalName');
  return toSummary(sheet, file?.originalName);
}

export async function getSheetImage(
  storage: ObjectStorage,
  userId: string,
  projectId: string,
  sheetId: string,
): Promise<{ url: string; expiresIn: number; pageNumber: number; contentType: string }> {
  await getProjectOrThrow(userId, projectId);
  const sheet = await getSheetOrThrow(projectId, sheetId);
  const file = await DrawingFile.findOne({ _id: sheet.fileId, projectId });
  if (file === null) {
    throw new ApiError(404, 'NOT_FOUND', 'File not found');
  }
  const env = loadEnv();
  const key = sheet.pageImageKey ?? file.storageKey;
  const url = await storage.presignGet(key, env.SIGNED_URL_TTL_SECONDS);
  return {
    url,
    expiresIn: env.SIGNED_URL_TTL_SECONDS,
    pageNumber: sheet.pageNumber,
    contentType: file.contentType,
  };
}
