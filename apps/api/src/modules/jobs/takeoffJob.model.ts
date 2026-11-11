import { model, Schema, type Document } from 'mongoose';
import type { PriceQuote } from '../pricing/pricingPlan.model';

export const JOB_STATUSES = [
  'queued',
  'processing',
  'awaiting_review',
  'in_review',
  'review_rejected',
  'approved',
  'compiling',
  'delivered',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STAGES = ['recognize', 'measure', 'convert', 'verify'] as const;
export type JobStageName = (typeof JOB_STAGES)[number];

export const STAGE_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface JobStage {
  name: JobStageName;
  status: StageStatus;
  attempts: number;
  startedAt?: Date | undefined;
  finishedAt?: Date | undefined;
  error?: string | undefined;
}

export const JOB_SLA_STATUSES = ['on_track', 'at_risk', 'breached', 'met'] as const;
export type JobSlaStatus = (typeof JOB_SLA_STATUSES)[number];

export type JobReason = 'initial' | 'rerun' | 'accuracy_retakeoff';

export interface JobSLA {
  submittedAt?: Date | undefined;
  processingStartedAt?: Date | undefined;
  qaCompletedAt?: Date | undefined;
  deliveredAt?: Date | undefined;
  deadlineAt: Date;
  status: JobSlaStatus;
}

export interface TakeoffJobAttrs {
  projectId: string;
  parentJobId?: string;
  reason: JobReason;
  status: JobStatus;
  stages: JobStage[];
  sla: JobSLA;
  priceQuote?: PriceQuote;
  fileIds: string[];
  sheetIds: string[];
  isTestData: boolean;
  leaseExpiresAt?: Date | undefined;
  createdAt?: Date;
  updatedAt?: Date;
}

const JobStageSchema = new Schema(
  {
    name: { type: String, enum: JOB_STAGES, required: true },
    status: { type: String, enum: STAGE_STATUSES, required: true, default: 'pending' },
    attempts: { type: Number, required: true, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    error: { type: String, trim: true },
  },
  { _id: false },
);

const TakeoffJobSchema = new Schema<TakeoffJobAttrs & Document>(
  {
    projectId: { type: String, required: true },
    parentJobId: { type: String, trim: true },
    reason: {
      type: String,
      enum: ['initial', 'rerun', 'accuracy_retakeoff'],
      required: true,
      default: 'initial',
    },
    status: { type: String, enum: JOB_STATUSES, required: true, default: 'queued' },
    stages: { type: [JobStageSchema], default: [] },
    sla: {
      submittedAt: { type: Date },
      processingStartedAt: { type: Date },
      qaCompletedAt: { type: Date },
      deliveredAt: { type: Date },
      deadlineAt: { type: Date, required: true },
      status: { type: String, enum: JOB_SLA_STATUSES, required: true, default: 'on_track' },
    },
    priceQuote: {
      planCode: {
        type: String,
        enum: ['per_takeoff', 'unlimited', 'express_addon', 'free_trial'],
      },
      planVersion: { type: Number },
      amountMinor: { type: Number },
      currency: { type: String, trim: true },
      isFreeTrial: { type: Boolean },
      overage: { type: Boolean },
    },
    fileIds: { type: [String], default: [] },
    sheetIds: { type: [String], default: [] },
    isTestData: { type: Boolean, required: true, default: false },
    leaseExpiresAt: { type: Date },
  },
  { timestamps: true },
);

export const TakeoffJob = model<TakeoffJobAttrs & Document>('TakeoffJob', TakeoffJobSchema);
