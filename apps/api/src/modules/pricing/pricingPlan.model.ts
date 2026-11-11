import { model, Schema, type Document } from 'mongoose';

export const PRICING_PLAN_CODES = [
  'per_takeoff',
  'unlimited',
  'express_addon',
  'free_trial',
] as const;
export type PricingPlanCode = (typeof PRICING_PLAN_CODES)[number];

export const PRICING_PLAN_STATUSES = ['draft', 'active', 'retired'] as const;
export type PricingPlanStatus = (typeof PRICING_PLAN_STATUSES)[number];

export interface PricingPlanParameters {
  includedTakeoffs?: number | undefined;
  overageAmountMinor?: number | undefined;
  maxSheets?: number | undefined;
  turnaroundHours?: number | undefined;
}

export interface PriceQuote {
  planCode: PricingPlanCode;
  planVersion: number;
  amountMinor: number;
  currency: string;
  isFreeTrial: boolean;
  overage: boolean;
}

export interface PricingPlanAttrs {
  code: PricingPlanCode;
  version: number;
  status: PricingPlanStatus;
  effectiveFrom: Date;
  currency: string;
  amountMinor: number;
  parameters: PricingPlanParameters;
}

const PricingPlanParametersSchema = new Schema(
  {
    includedTakeoffs: { type: Number },
    overageAmountMinor: { type: Number },
    maxSheets: { type: Number },
    turnaroundHours: { type: Number },
  },
  { _id: false },
);

const PricingPlanSchema = new Schema<PricingPlanAttrs & Document>(
  {
    code: { type: String, enum: PRICING_PLAN_CODES, required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: PRICING_PLAN_STATUSES, required: true, default: 'draft' },
    effectiveFrom: { type: Date, required: true },
    currency: { type: String, required: true, trim: true, uppercase: true },
    amountMinor: { type: Number, required: true, min: 0 },
    parameters: { type: PricingPlanParametersSchema, default: {} },
  },
  { timestamps: true },
);

PricingPlanSchema.index({ code: 1, version: 1 }, { unique: true });

export const PricingPlan = model<PricingPlanAttrs & Document>('PricingPlan', PricingPlanSchema);
