import { model, Schema, type Document } from 'mongoose';

export const DELIVERABLE_TYPES = ['boq_xlsx', 'annotated_pdf'] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const DELIVERABLE_STATUSES = ['generating', 'ready', 'failed', 'superseded'] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];

export interface DeliverableAttrs {
  projectId: string;
  jobId: string;
  type: DeliverableType;
  status: DeliverableStatus;
  storageKey: string;
  sizeBytes?: number;
  sha256?: string;
  version: number;
  isTestData: boolean;
  generatedBy: string;
}

const DeliverableSchema = new Schema<DeliverableAttrs & Document>(
  {
    projectId: { type: String, required: true },
    jobId: { type: String, required: true },
    type: { type: String, enum: DELIVERABLE_TYPES, required: true },
    status: { type: String, enum: DELIVERABLE_STATUSES, required: true, default: 'generating' },
    storageKey: { type: String, required: true },
    sizeBytes: { type: Number },
    sha256: { type: String, trim: true },
    version: { type: Number, required: true, default: 1 },
    isTestData: { type: Boolean, required: true, default: true },
    generatedBy: { type: String, required: true },
  },
  { timestamps: true },
);

DeliverableSchema.index({ jobId: 1, type: 1, version: -1 });

export const Deliverable = model<DeliverableAttrs & Document>('Deliverable', DeliverableSchema);
