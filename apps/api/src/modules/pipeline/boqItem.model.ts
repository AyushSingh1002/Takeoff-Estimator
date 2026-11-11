import { model, Schema, type Document } from 'mongoose';

export const BOQ_REVIEW_STATUSES = ['pending', 'accepted', 'corrected', 'rejected'] as const;
export type BoqReviewStatus = (typeof BOQ_REVIEW_STATUSES)[number];

export interface BoqOverride {
  value: number;
  reason: string;
}

export interface BoqItemAttrs {
  projectId: string;
  jobId: string;
  trade: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  wasteFactor: number;
  adjustedQuantity: number;
  measurementIds: string[];
  sheetRefs: string[];
  rulePackId: string;
  ruleKey: string;
  engineVersion: string;
  assumptions: string[];
  reviewStatus: BoqReviewStatus;
  override?: BoqOverride | undefined;
}

const BoqItemSchema = new Schema<BoqItemAttrs & Document>(
  {
    projectId: { type: String, required: true },
    jobId: { type: String, required: true },
    trade: { type: String, required: true },
    code: { type: String, required: true },
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    wasteFactor: { type: Number, required: true },
    adjustedQuantity: { type: Number, required: true },
    measurementIds: { type: [String], default: [] },
    sheetRefs: { type: [String], default: [] },
    rulePackId: { type: String, required: true },
    ruleKey: { type: String, required: true },
    engineVersion: { type: String, required: true },
    assumptions: { type: [String], default: [] },
    reviewStatus: { type: String, enum: BOQ_REVIEW_STATUSES, required: true, default: 'pending' },
    override: {
      value: { type: Number },
      reason: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

export const BoqItem = model<BoqItemAttrs & Document>('BoqItem', BoqItemSchema);
