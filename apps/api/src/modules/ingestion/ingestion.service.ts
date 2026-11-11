import { HydratedDocument } from 'mongoose';
import { loadEnv } from '../../config/env';
import { DrawingFile, type DrawingFileAttrs } from '../projects/project.model';
import {
  DrawingSheet,
  SHEET_CLASSIFICATIONS,
  type SheetClassification,
} from './drawingSheet.model';
import { getIntakeProvider, type ProcessingIntake } from './intakeProvider';

export type DrawingFileDoc = HydratedDocument<DrawingFileAttrs>;

function toSheetClassification(value: string): SheetClassification {
  return SHEET_CLASSIFICATIONS.includes(value as SheetClassification)
    ? (value as SheetClassification)
    : 'other';
}

export async function claimNextDrawingFile(): Promise<DrawingFileDoc | null> {
  const env = loadEnv();
  const leaseExpiresAt = new Date(Date.now() + env.JOB_LEASE_SECONDS * 1000);
  const claimed = await DrawingFile.findOneAndUpdate(
    { status: 'uploaded' },
    { status: 'ingesting', leaseExpiresAt },
    { new: true },
  ).sort({ createdAt: 1 });
  return claimed;
}

export async function runIngestion(
  file: DrawingFileDoc,
): Promise<{ file: DrawingFileDoc; intake: ProcessingIntake }> {
  const intake = getIntakeProvider().extract(file.storageKey, file.originalName);

  if (intake.status === 'rejected') {
    file.status = 'rejected';
    if (intake.rejectionReason !== undefined) {
      file.rejectionReason = intake.rejectionReason;
    }
    file.intakeReport = intake.intakeReport;
    await file.save();
    return { file, intake };
  }

  await DrawingSheet.deleteMany({ fileId: file._id.toString() });
  await DrawingSheet.create(
    intake.sheets.map((sheet) => ({
      projectId: file.projectId,
      fileId: file._id.toString(),
      pageNumber: sheet.pageNumber,
      sourceKind: sheet.sourceKind,
      classification: toSheetClassification(sheet.classification),
      classificationConfidence: sheet.classificationConfidence,
      discipline: 'architectural' as const,
      sheetType: toSheetClassification(sheet.classification),
      quality: 'good' as const,
      qualityReasons: [],
      widthPt: sheet.widthPt,
      heightPt: sheet.heightPt,
      scale: sheet.scale,
      inclusion: 'included' as const,
    })),
  );

  file.status = 'ingested';
  file.pageCount = intake.pageCount;
  file.intakeReport = intake.intakeReport;
  await file.save();

  return { file, intake };
}
