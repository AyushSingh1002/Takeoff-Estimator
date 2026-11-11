import { model, Schema, type Document } from 'mongoose';

export const PROJECT_STATUSES = ['draft', 'in_progress', 'delivered', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectLocation {
  country?: string | undefined;
  region?: string | undefined;
}

export interface ProjectAttrs {
  ownerId: string;
  name: string;
  reference: string;
  location?: ProjectLocation;
  regionPackCode: string;
  status: ProjectStatus;
  tier?: 'standard' | 'express';
  submittedAt?: Date;
  deliveredAt?: Date;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProjectSchema = new Schema<ProjectAttrs & Document>(
  {
    ownerId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    reference: { type: String, required: true, unique: true, trim: true },
    location: { type: Schema.Types.Mixed },
    regionPackCode: { type: String, required: true, trim: true },
    status: { type: String, enum: PROJECT_STATUSES, default: 'draft' },
    tier: { type: String, enum: ['standard', 'express'], default: 'standard' },
    submittedAt: { type: Date },
    deliveredAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export const Project = model<ProjectAttrs & Document>('Project', ProjectSchema);

export const DRAWING_FILE_STATUSES = [
  'upload_pending',
  'uploaded',
  'ingesting',
  'ingested',
  'rejected',
  'failed',
] as const;
export type DrawingFileStatus = (typeof DRAWING_FILE_STATUSES)[number];

export interface DrawingFileAttrs {
  projectId: string;
  originalName: string;
  storageKey: string;
  sizeBytes: number;
  contentType: string;
  sha256?: string;
  pageCount?: number;
  status: DrawingFileStatus;
  createdAt?: Date;
  updatedAt?: Date;
  rejectionReason?: string;
  intakeReport?: DrawingFileIntakeReport;
  jobId?: string;
}

export interface DrawingFileIntakeReport {
  status: string;
  rejectionReason?: string;
  pageCount: number;
  sourceKind: string;
  unreadablePages: number;
  missingScalePages: number;
}

const DrawingFileSchema = new Schema<DrawingFileAttrs & Document>(
  {
    projectId: { type: String, required: true },
    originalName: { type: String, required: true, trim: true },
    storageKey: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    contentType: { type: String, required: true },
    sha256: { type: String },
    pageCount: { type: Number },
    status: { type: String, required: true, default: 'upload_pending' },
    rejectionReason: { type: String, trim: true },
    intakeReport: { type: Schema.Types.Mixed },
    jobId: { type: String, trim: true },
  },
  { timestamps: true },
);

export const DrawingFile = model<DrawingFileAttrs & Document>('DrawingFile', DrawingFileSchema);
