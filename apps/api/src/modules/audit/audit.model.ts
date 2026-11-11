import { Schema, model, type Model } from 'mongoose';

export interface AuditLogAttrs {
  at: Date;
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
  ip?: string;
  requestId?: string;
}

const AuditLogSchema = new Schema<AuditLogAttrs>(
  {
    at: { type: Date, required: true },
    actorId: { type: String },
    actorRole: { type: String },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    projectId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    note: { type: String, trim: true },
    ip: { type: String },
    requestId: { type: String },
  },
  { timestamps: true },
);

export const AuditLog: Model<AuditLogAttrs> = model<AuditLogAttrs>('AuditLog', AuditLogSchema);

export async function recordAudit(entry: AuditLogAttrs): Promise<void> {
  await AuditLog.create(entry);
}
