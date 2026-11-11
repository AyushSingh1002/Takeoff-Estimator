import { model, Schema, type Document } from 'mongoose';

export const SHEET_SOURCE_KINDS = ['vector_pdf', 'raster_pdf', 'image'] as const;
export type SheetSourceKind = (typeof SHEET_SOURCE_KINDS)[number];

export const SHEET_CLASSIFICATIONS = [
  'floor_plan',
  'section',
  'elevation',
  'detail',
  'schedule',
  'site',
  'cover',
  'other',
  'unknown',
] as const;
export type SheetClassification = (typeof SHEET_CLASSIFICATIONS)[number];

export const SHEET_DISCIPLINES = [
  'architectural',
  'structural',
  'mep',
  'other',
  'unknown',
] as const;
export type SheetDiscipline = (typeof SHEET_DISCIPLINES)[number];

export const SHEET_QUALITIES = ['good', 'degraded', 'unreadable'] as const;
export type SheetQuality = (typeof SHEET_QUALITIES)[number];

export const SHEET_INCLUSIONS = ['included', 'excluded'] as const;
export type SheetInclusion = (typeof SHEET_INCLUSIONS)[number];

export const SCALE_STATUSES = [
  'detected',
  'user_provided',
  'calibrated',
  'missing',
  'conflicting',
] as const;
export type ScaleStatus = (typeof SCALE_STATUSES)[number];

export interface SheetScale {
  status: ScaleStatus;
  label?: string | undefined;
  ratio?: number | undefined;
  source?: string | undefined;
  confidence?: number | undefined;
  calibration?: {
    pointA: number;
    pointB: number;
    knownLengthMm: number;
  };
}

export interface DrawingSheetAttrs {
  projectId: string;
  fileId: string;
  pageNumber: number;
  sourceKind: SheetSourceKind;
  sheetNumber?: string;
  title?: string;
  classification: SheetClassification;
  classificationConfidence: number;
  discipline: SheetDiscipline;
  sheetType: SheetClassification;
  quality: SheetQuality;
  qualityReasons: string[];
  widthPt?: number;
  heightPt?: number;
  rotation?: number;
  scale: SheetScale;
  inclusion: SheetInclusion;
  exclusionReason?: string | undefined;
  pageImageKey?: string;
  thumbnailKey?: string;
}

const DrawingSheetSchema = new Schema<DrawingSheetAttrs & Document>(
  {
    projectId: { type: String, required: true },
    fileId: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    sourceKind: { type: String, enum: SHEET_SOURCE_KINDS, required: true },
    sheetNumber: { type: String, trim: true },
    title: { type: String, trim: true },
    classification: { type: String, enum: SHEET_CLASSIFICATIONS, required: true },
    classificationConfidence: { type: Number, required: true },
    discipline: { type: String, enum: SHEET_DISCIPLINES, required: true, default: 'unknown' },
    sheetType: { type: String, enum: SHEET_CLASSIFICATIONS, required: true, default: 'other' },
    quality: { type: String, enum: SHEET_QUALITIES, required: true, default: 'good' },
    qualityReasons: { type: [String], default: [] },
    widthPt: { type: Number },
    heightPt: { type: Number },
    rotation: { type: Number },
    scale: {
      status: { type: String, enum: SCALE_STATUSES, required: true },
      label: { type: String, trim: true },
      ratio: { type: Number },
      source: { type: String, trim: true },
      confidence: { type: Number },
      calibration: {
        pointA: { type: Number },
        pointB: { type: Number },
        knownLengthMm: { type: Number },
      },
    },
    inclusion: { type: String, enum: SHEET_INCLUSIONS, required: true, default: 'included' },
    exclusionReason: { type: String, trim: true },
    pageImageKey: { type: String, trim: true },
    thumbnailKey: { type: String, trim: true },
  },
  { timestamps: true },
);

DrawingSheetSchema.index({ projectId: 1, fileId: 1, pageNumber: 1 }, { unique: true });

export const DrawingSheet = model<DrawingSheetAttrs & Document>('DrawingSheet', DrawingSheetSchema);
