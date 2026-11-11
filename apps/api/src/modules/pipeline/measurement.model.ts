import { model, Schema, type Document } from 'mongoose';

export const MEASUREMENT_TYPES = ['length', 'area', 'volume', 'count'] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export const MEASUREMENT_UNITS = ['m', 'm2', 'm3', 'count'] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export interface MeasurementAttrs {
  projectId: string;
  jobId: string;
  sheetId?: string;
  objectIds: string[];
  zone?: { level?: string; room?: string };
  type: MeasurementType;
  value: number;
  unit: MeasurementUnit;
  method: string;
  confidence: number;
  scaleRef?: string;
  annotationId?: string;
  sourceAnnotation?: string;
  geometry?: unknown;
}

const MeasurementSchema = new Schema<MeasurementAttrs & Document>(
  {
    projectId: { type: String, required: true },
    jobId: { type: String, required: true },
    sheetId: { type: String, trim: true },
    objectIds: { type: [String], default: [] },
    zone: { type: { level: { type: String }, room: { type: String } } },
    type: { type: String, enum: MEASUREMENT_TYPES, required: true },
    value: { type: Number, required: true },
    unit: { type: String, enum: MEASUREMENT_UNITS, required: true },
    method: { type: String, required: true },
    confidence: { type: Number, required: true },
    scaleRef: { type: String, trim: true },
    annotationId: { type: String, trim: true },
    sourceAnnotation: { type: String, trim: true },
    geometry: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const Measurement = model<MeasurementAttrs & Document>('Measurement', MeasurementSchema);
