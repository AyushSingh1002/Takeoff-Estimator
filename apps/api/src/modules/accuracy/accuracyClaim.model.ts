import { model, Schema, type Document } from 'mongoose';

export const ACCURACY_CLAIM_STATUSES = [
  'submitted',
  'under_review',
  'upheld',
  'rejected',
  'retakeoff_in_progress',
  'resolved',
] as const;
export type AccuracyClaimStatus = (typeof ACCURACY_CLAIM_STATUSES)[number];

export interface AccuracyClaimDecision {
  by: string;
  note: string;
  at: Date;
}

export interface AccuracyClaimAttrs {
  jobId: string;
  projectId: string;
  filedBy: string;
  status: AccuracyClaimStatus;
  reason: string;
  evidence: string[];
  benchmarkId?: string;
  retakeoffJobId?: string;
  decision?: AccuracyClaimDecision;
}

const DecisionSchema = new Schema(
  {
    by: { type: String, required: true },
    note: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const AccuracyClaimSchema = new Schema<AccuracyClaimAttrs & Document>(
  {
    jobId: { type: String, required: true },
    projectId: { type: String, required: true },
    filedBy: { type: String, required: true },
    status: { type: String, enum: ACCURACY_CLAIM_STATUSES, required: true, default: 'submitted' },
    reason: { type: String, required: true, trim: true },
    evidence: { type: [String], default: [] },
    benchmarkId: { type: String, trim: true },
    retakeoffJobId: { type: String, trim: true },
    decision: { type: DecisionSchema },
  },
  { timestamps: true },
);

AccuracyClaimSchema.index({ jobId: 1 });
AccuracyClaimSchema.index({ filedBy: 1, status: 1 });

export const AccuracyClaim = model<AccuracyClaimAttrs & Document>(
  'AccuracyClaim',
  AccuracyClaimSchema,
);
