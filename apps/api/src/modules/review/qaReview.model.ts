import { model, Schema, type Document } from 'mongoose';

export const QA_REVIEW_STATUSES = [
  'assigned',
  'in_progress',
  'approved',
  'rejected',
  'reassigned',
] as const;
export type QAReviewStatus = (typeof QA_REVIEW_STATUSES)[number];

export interface QAReviewAttrs {
  jobId: string;
  reviewerId: string;
  kind: 'primary' | 'second_review';
  status: QAReviewStatus;
  assignedBy: string;
  startedAt?: Date;
  submittedAt?: Date;
  notes?: string;
}

const QAReviewSchema = new Schema<QAReviewAttrs & Document>(
  {
    jobId: { type: String, required: true },
    reviewerId: { type: String, required: true },
    kind: { type: String, enum: ['primary', 'second_review'], required: true },
    status: { type: String, enum: QA_REVIEW_STATUSES, required: true, default: 'assigned' },
    assignedBy: { type: String, required: true },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

export const QAReview = model<QAReviewAttrs & Document>('QAReview', QAReviewSchema);
