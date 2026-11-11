import { model, Schema, type Document } from 'mongoose';

export const SUBSCRIPTION_STATUSES = ['active', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionAttrs {
  userId: string;
  planCode: 'unlimited';
  planVersion: number;
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
}

const SubscriptionSchema = new Schema<SubscriptionAttrs & Document>(
  {
    userId: { type: String, required: true },
    planCode: { type: String, enum: ['unlimited'], required: true },
    planVersion: { type: Number, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, default: 'active' },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1, status: 1 });

export const Subscription = model<SubscriptionAttrs & Document>('Subscription', SubscriptionSchema);
