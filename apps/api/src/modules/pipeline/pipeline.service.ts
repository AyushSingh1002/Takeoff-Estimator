import { HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { DrawingFile } from '../projects/project.model';
import { getIntakeProvider } from '../ingestion/intakeProvider';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { sheetRefFor } from '../ingestion/sheetRef';
import { polygonAreaM2, polygonPerimeterM } from '../geometry/geometry';
import { DRYWALL_ENGINE_VERSION } from '../geometry/drywall';
import { CONCRETE_ENGINE_VERSION } from '../geometry/concrete';
import { DetectedObject, type DetectedObjectClass } from './detectedObject.model';
import { Measurement, type MeasurementType, type MeasurementUnit } from './measurement.model';
import { BoqItem } from './boqItem.model';
import { Discrepancy, type DiscrepancyType, type DiscrepancySeverity } from './discrepancy.model';
import { TakeoffJob, type JobStageName, type TakeoffJobAttrs } from '../jobs/takeoffJob.model';

export type StageOutcome = { ok: true } | { ok: false; error: string };

type TakeoffJobDoc = HydratedDocument<TakeoffJobAttrs>;

/**
 * Jobs created after intake review snapshot the included DrawingSheet ids.
 * Legacy jobs have an empty snapshot and must keep processing every page.
 */
async function includedSheetRefs(job: TakeoffJobDoc): Promise<Set<string> | null> {
  if (job.sheetIds.length === 0) {
    return null;
  }
  const sheets = await DrawingSheet.find({ _id: { $in: job.sheetIds } }).select(
    'fileId pageNumber',
  );
  return new Set(sheets.map((sheet) => sheetRefFor(sheet.fileId, sheet.pageNumber)));
}

const CLASS_BY_CLASSIFICATION: Record<string, DetectedObjectClass> = {
  floor_plan: 'room',
  section: 'wall',
};

async function getJobOrThrow(jobId: string): Promise<TakeoffJobDoc> {
  const job = await TakeoffJob.findById(jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  return job;
}

export async function runStageByName(
  jobId: string,
  stageName: JobStageName,
): Promise<StageOutcome> {
  switch (stageName) {
    case 'recognize':
      return runRecognize(jobId);
    case 'measure':
      return runMeasure(jobId);
    case 'convert':
      return runConvert(jobId);
    case 'verify':
      return runVerify(jobId);
    default:
      return { ok: false, error: `unsupported_stage:${stageName}` };
  }
}

export async function runRecognize(jobId: string): Promise<StageOutcome> {
  const job = await getJobOrThrow(jobId);
  await DetectedObject.deleteMany({ jobId });
  const files = await DrawingFile.find({ _id: { $in: job.fileIds } });
  const allowedRefs = await includedSheetRefs(job);
  const provider = getIntakeProvider();
  for (const file of files) {
    const intake = provider.extract(file.storageKey, file.originalName);
    if (intake.status !== 'ingested') {
      continue;
    }
    for (const sheet of intake.sheets) {
      const sheetRef = sheetRefFor(file._id.toString(), sheet.pageNumber);
      if (allowedRefs !== null && !allowedRefs.has(sheetRef)) {
        continue;
      }
      const detectedClass = CLASS_BY_CLASSIFICATION[sheet.classification] ?? 'other';
      const widthPt = sheet.widthPt ?? 0;
      const heightPt = sheet.heightPt ?? 0;
      await DetectedObject.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        sheetId: sheetRef,
        class: detectedClass,
        geometry: {
          kind: 'Polygon',
          coordinates: [
            [0, 0],
            [widthPt, 0],
            [widthPt, heightPt],
            [0, heightPt],
          ],
        },
        confidence: sheet.classificationConfidence,
      });
    }
  }
  return { ok: true };
}

export async function runMeasure(jobId: string): Promise<StageOutcome> {
  const job = await getJobOrThrow(jobId);
  await Measurement.deleteMany({ jobId });
  await Discrepancy.deleteMany({
    jobId,
    type: { $in: ['missing_scale', 'conflicting_scale'] },
  });
  const files = await DrawingFile.find({ _id: { $in: job.fileIds } });
  const allowedRefs = await includedSheetRefs(job);
  const provider = getIntakeProvider();
  for (const file of files) {
    const intake = provider.extract(file.storageKey, file.originalName);
    if (intake.status !== 'ingested') {
      continue;
    }
    for (const sheet of intake.sheets) {
      const sheetRef = sheetRefFor(file._id.toString(), sheet.pageNumber);
      if (allowedRefs !== null && !allowedRefs.has(sheetRef)) {
        continue;
      }
      const detectedClass = CLASS_BY_CLASSIFICATION[sheet.classification] ?? 'other';
      const measurementType: MeasurementType = detectedClass === 'wall' ? 'length' : 'area';
      const unit: MeasurementUnit = measurementType === 'area' ? 'm2' : 'm';
      if (sheet.scale.status !== 'detected' && sheet.scale.status !== 'calibrated') {
        const discrepancyType: DiscrepancyType =
          sheet.scale.status === 'missing' ? 'missing_scale' : 'conflicting_scale';
        const severity: DiscrepancySeverity = 'blocking';
        await Discrepancy.create({
          projectId: job.projectId,
          jobId: job._id.toString(),
          sheetId: sheetRef,
          type: discrepancyType,
          severity,
          note: `Sheet ${sheet.pageNumber} scale status is ${sheet.scale.status}`,
        });
        continue;
      }
      const ratio = sheet.scale.ratio ?? 0;
      const polygon = [
        [0, 0],
        [sheet.widthPt ?? 0, 0],
        [sheet.widthPt ?? 0, sheet.heightPt ?? 0],
        [0, sheet.heightPt ?? 0],
      ];
      const value =
        measurementType === 'area'
          ? polygonAreaM2(polygon, ratio)
          : polygonPerimeterM(polygon, ratio);
      const annotationId = `M-${file._id.toString()}-${sheet.pageNumber}-1`;
      await Measurement.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        sheetId: sheetRef,
        objectIds: [],
        type: measurementType,
        value,
        unit,
        method: measurementType === 'area' ? 'polygon_area_scale' : 'polygon_perimeter_scale',
        confidence: sheet.classificationConfidence,
        scaleRef: sheet.scale.source ?? `scale:${sheet.scale.ratio}`,
        annotationId,
        sourceAnnotation: annotationId,
      });
    }
  }
  return { ok: true };
}

export async function runConvert(jobId: string): Promise<StageOutcome> {
  const job = await getJobOrThrow(jobId);
  await BoqItem.deleteMany({ jobId });
  const measurements = await Measurement.find({ jobId });
  for (const measurement of measurements) {
    const measurementId = measurement._id.toString();
    const sheetRef =
      measurement.annotationId ??
      measurement.sourceAnnotation ??
      measurement.sheetId ??
      measurementId;
    if (measurement.type === 'area') {
      const netAreaM2 = measurement.value;
      const wasteFactor = 0.05;
      await BoqItem.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        trade: 'drywall',
        code: 'drywall.board',
        description: 'Wall board area',
        quantity: netAreaM2,
        unit: 'm2',
        wasteFactor,
        adjustedQuantity: netAreaM2 * (1 + wasteFactor),
        measurementIds: [measurementId],
        sheetRefs: [sheetRef],
        rulePackId: 'drywall.us.2026.1',
        ruleKey: 'drywall.board',
        engineVersion: DRYWALL_ENGINE_VERSION,
        assumptions: ['Drywall board 1.2x2.4 m; breakage allowance 10%'],
        reviewStatus: 'pending',
      });
      continue;
    }
    if (measurement.type === 'volume') {
      const volumeM3 = measurement.value;
      const wasteFactor = 0.05;
      await BoqItem.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        trade: 'concrete',
        code: 'concrete.volume',
        description: 'Slab volume',
        quantity: volumeM3,
        unit: 'm3',
        wasteFactor,
        adjustedQuantity: volumeM3 * (1 + wasteFactor),
        measurementIds: [measurementId],
        sheetRefs: [sheetRef],
        rulePackId: 'concrete.us.2026.1',
        ruleKey: 'concrete.volume',
        engineVersion: CONCRETE_ENGINE_VERSION,
        assumptions: ['Slab concrete; waste factor 5%'],
        reviewStatus: 'pending',
      });
    }
  }
  return { ok: true };
}

export async function runVerify(jobId: string): Promise<StageOutcome> {
  const job = await getJobOrThrow(jobId);
  await Discrepancy.deleteMany({
    jobId,
    type: { $in: ['unsupported_object', 'low_confidence_object', 'invalid_measurement'] },
  });
  const objects = await DetectedObject.find({ jobId });
  const supportedClasses: DetectedObjectClass[] = [
    'wall',
    'door',
    'window',
    'room',
    'slab',
    'column',
  ];
  for (const object of objects) {
    if (!supportedClasses.includes(object.class)) {
      await Discrepancy.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        sheetId: object.sheetId,
        type: 'unsupported_object',
        severity: 'blocking',
        note: `Object class ${object.class} is not supported by the active provider`,
      });
    }
    if (object.confidence !== undefined && object.confidence < 0.5) {
      await Discrepancy.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        sheetId: object.sheetId,
        type: 'low_confidence_object',
        severity: 'warning',
        note: `Object confidence ${object.confidence} is below 0.5`,
      });
    }
  }
  const measurements = await Measurement.find({ jobId });
  for (const measurement of measurements) {
    if (!Number.isFinite(measurement.value) || measurement.value <= 0) {
      await Discrepancy.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        sheetId: measurement.sheetId,
        type: 'invalid_measurement',
        severity: 'blocking',
        measurementId: measurement._id.toString(),
        note: `Measurement value ${measurement.value} is invalid`,
      });
    }
  }
  return { ok: true };
}
