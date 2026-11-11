import { model, Schema, type Document } from 'mongoose';

export const RULE_PACK_TRADES = ['drywall', 'concrete'] as const;
export type RulePackTrade = (typeof RULE_PACK_TRADES)[number];

export const RULE_PACK_STATUSES = ['draft', 'approved', 'retired'] as const;
export type RulePackStatus = (typeof RULE_PACK_STATUSES)[number];

export interface RulePackParameters {
  [key: string]: number;
}

export interface RulePackAttrs {
  trade: RulePackTrade;
  regionPackCode: string;
  version: string;
  status: RulePackStatus;
  parameters: RulePackParameters;
  unitsDisplay?: string;
  engineVersionRange?: string;
  approvedBy?: string;
  approvedAt?: Date;
  notes?: string;
}

const RulePackSchema = new Schema<RulePackAttrs & Document>(
  {
    trade: { type: String, enum: RULE_PACK_TRADES, required: true },
    regionPackCode: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
    status: { type: String, enum: RULE_PACK_STATUSES, required: true, default: 'draft' },
    parameters: { type: Schema.Types.Mixed, required: true },
    unitsDisplay: { type: String, trim: true },
    engineVersionRange: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    approvedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

RulePackSchema.index({ trade: 1, regionPackCode: 1, version: 1 }, { unique: true });

export const RulePack = model<RulePackAttrs & Document>('RulePack', RulePackSchema);
