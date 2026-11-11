import { model, Schema, type Document } from 'mongoose';

export const DISCREPANCY_TYPES = [
  'missing_scale',
  'conflicting_scale',
  'unreadable_sheet',
  'low_confidence_object',
  'invalid_measurement',
  'room_area_mismatch',
  'wall_material_mismatch',
  'unusual_quantity',
  'unsupported_object',
  'calibration_mismatch',
] as const;
export type DiscrepancyType = (typeof DISCREPANCY_TYPES)[number];

export const DISCREPANCY_SEVERITIES = ['info', 'warning', 'blocking'] as const;
export type DiscrepancySeverity = (typeof DISCREPANCY_SEVERITIES)[number];

export interface DiscrepancyAttrs {
  projectId: string;
  jobId: string;
  sheetId?: string;
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  status: 'open' | 'resolved' | 'dismissed';
  note?: string;
  measurementId?: string;
  boqItemId?: string;
}

const DiscrepancySchema = new Schema<DiscrepancyAttrs & Document>(
  {
    projectId: { type: String, required: true },
    jobId: { type: String, required: true },
    sheetId: { type: String, trim: true },
    type: { type: String, enum: DISCREPANCY_TYPES, required: true },
    severity: { type: String, enum: DISCREPANCY_SEVERITIES, required: true },
    status: {
      type: String,
      enum: ['open', 'resolved', 'dismissed'],
      required: true,
      default: 'open',
    },
    note: { type: String, trim: true },
    measurementId: { type: String, trim: true },
    boqItemId: { type: String, trim: true },
  },
  { timestamps: true },
);

export const Discrepancy = model<DiscrepancyAttrs & Document>('Discrepancy', DiscrepancySchema);
