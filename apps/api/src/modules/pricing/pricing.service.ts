import type { HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { writeAudit } from '../audit/audit.service';
import { User } from '../auth/auth.model';
import { DrawingSheet } from '../ingestion/drawingSheet.model';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { Project } from '../projects/project.model';
import {
  PricingPlan,
  type PriceQuote,
  type PricingPlanAttrs,
  type PricingPlanCode,
} from './pricingPlan.model';
import {
  Subscription,
  type SubscriptionAttrs,
  type SubscriptionStatus,
} from './subscription.model';
import type { PublishPricingPlanInput, SubscriptionInput } from './pricing.schemas';

export type PricingPlanDoc = HydratedDocument<PricingPlanAttrs>;
export type SubscriptionDoc = HydratedDocument<SubscriptionAttrs>;

export const DEFAULT_TURNAROUND_HOURS = 24;

export interface ProjectQuote {
  projectId: string;
  sheetCount: number;
  includedSheets: number;
  excludedSheets: number;
  price: PriceQuote;
  entitlement: {
    allowed: boolean;
    code?: string;
    message?: string;
  };
  targetTurnaroundHours: number;
  targetDeadlineAt: Date;
}

export interface UsageSummary {
  planCode: PricingPlanCode;
  planVersion?: number | undefined;
  trialAvailable: boolean;
  trialUsedAt?: Date | undefined;
  amountMinor?: number | undefined;
  currency?: string | undefined;
  maxSheets?: number | undefined;
  used?: number | undefined;
  includedTakeoffs?: number | undefined;
  remaining?: number | undefined;
  overageCount?: number | undefined;
  overageAmountMinor?: number | undefined;
  periodStart?: Date | undefined;
  periodEnd?: Date | undefined;
}

function nowOr(value: Date | undefined): Date {
  return value ?? new Date();
}

async function activateDuePlans(code: PricingPlanCode, at: Date): Promise<void> {
  const due = await PricingPlan.find({
    code,
    status: 'draft',
    effectiveFrom: { $lte: at },
  }).sort({ version: 1 });
  for (const plan of due) {
    await PricingPlan.updateMany(
      { code, status: 'active', _id: { $ne: plan._id } },
      { status: 'retired' },
    );
    plan.status = 'active';
    await plan.save();
  }
}

export async function getEffectivePlan(
  code: PricingPlanCode,
  at: Date = new Date(),
): Promise<PricingPlanDoc | null> {
  await activateDuePlans(code, at);
  return PricingPlan.findOne({
    code,
    status: 'active',
    effectiveFrom: { $lte: at },
  }).sort({ version: -1 });
}

export async function getPricingPlan(
  code: PricingPlanCode,
  version: number,
): Promise<PricingPlanDoc | null> {
  return PricingPlan.findOne({ code, version });
}

export async function listPricingPlans(code?: PricingPlanCode): Promise<PricingPlanDoc[]> {
  return PricingPlan.find(code === undefined ? {} : { code }).sort({ code: 1, version: -1 });
}

export async function publishPricingPlan(
  input: PublishPricingPlanInput,
  actorId: string,
): Promise<PricingPlanDoc> {
  const at = new Date();
  const effectiveFrom = input.effectiveFrom ?? at;
  const latest = await PricingPlan.findOne({ code: input.code }).sort({ version: -1 });
  const version = (latest?.version ?? 0) + 1;
  const active = effectiveFrom.getTime() <= at.getTime();
  const plan = await PricingPlan.create({
    code: input.code,
    version,
    status: active ? 'active' : 'draft',
    effectiveFrom,
    currency: input.currency,
    amountMinor: input.amountMinor,
    parameters: input.parameters,
  });
  if (active) {
    await PricingPlan.updateMany(
      { code: input.code, status: 'active', _id: { $ne: plan._id } },
      { status: 'retired' },
    );
  }
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'pricing.publish',
    entityType: 'PricingPlan',
    entityId: plan._id.toString(),
    after: {
      code: plan.code,
      version: plan.version,
      status: plan.status,
      effectiveFrom: plan.effectiveFrom,
      currency: plan.currency,
      amountMinor: plan.amountMinor,
      parameters: plan.parameters,
    },
  });
  return plan;
}

export async function getActiveSubscription(
  userId: string,
  at: Date = new Date(),
): Promise<SubscriptionDoc | null> {
  return Subscription.findOne({
    userId,
    status: 'active' as SubscriptionStatus,
    periodStart: { $lte: at },
    periodEnd: { $gte: at },
  }).sort({ createdAt: -1 });
}

export async function grantSubscription(
  input: SubscriptionInput,
  actorId: string,
): Promise<SubscriptionDoc> {
  const plan = await getEffectivePlan('unlimited');
  if (plan === null) {
    throw new ApiError(409, 'CONFLICT', 'No active unlimited pricing plan');
  }
  const periodStart = nowOr(input.periodStart);
  const periodEnd = input.periodEnd ?? new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  await Subscription.updateMany(
    { userId: input.userId, status: 'active' },
    { status: 'cancelled' as SubscriptionStatus },
  );
  const subscription = await Subscription.create({
    userId: input.userId,
    planCode: 'unlimited',
    planVersion: plan.version,
    status: 'active',
    periodStart,
    periodEnd,
    createdBy: actorId,
  });
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'subscription.grant',
    entityType: 'Subscription',
    entityId: subscription._id.toString(),
    after: {
      userId: subscription.userId,
      planCode: subscription.planCode,
      planVersion: subscription.planVersion,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
    },
  });
  return subscription;
}

export async function cancelSubscription(input: SubscriptionInput, actorId: string): Promise<void> {
  const subscription = await Subscription.findOneAndUpdate(
    { userId: input.userId, status: 'active' },
    { status: 'cancelled' as SubscriptionStatus },
    { new: true },
  );
  if (subscription === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Active subscription not found');
  }
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'subscription.cancel',
    entityType: 'Subscription',
    entityId: subscription._id.toString(),
    after: { userId: subscription.userId, status: subscription.status },
  });
}

async function countBillableJobs(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const projects = await Project.find({ ownerId: userId, deletedAt: null }).select('_id');
  const projectIds = projects.map((project) => project._id.toString());
  if (projectIds.length === 0) {
    return 0;
  }
  return TakeoffJob.countDocuments({
    projectId: { $in: projectIds },
    reason: 'initial',
    status: { $ne: 'cancelled' },
    createdAt: { $gte: periodStart, $lte: periodEnd },
  });
}

async function resolvePlanForQuote(
  userId: string,
  at: Date,
): Promise<{ plan: PricingPlanDoc; isFreeTrial: boolean; period?: { start: Date; end: Date } }> {
  const subscription = await getActiveSubscription(userId, at);
  if (subscription !== null) {
    const plan =
      (await getPricingPlan('unlimited', subscription.planVersion)) ??
      (await getEffectivePlan('unlimited', at));
    if (plan === null) {
      throw new ApiError(409, 'CONFLICT', 'Pricing plan is not configured');
    }
    return {
      plan,
      isFreeTrial: false,
      period: { start: subscription.periodStart, end: subscription.periodEnd },
    };
  }

  const user = await User.findById(userId);
  if (user === null) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  if (user.freeTrialUsedAt === undefined) {
    const trialPlan = await getEffectivePlan('free_trial', at);
    if (trialPlan !== null) {
      return { plan: trialPlan, isFreeTrial: true };
    }
  }
  const plan = await getEffectivePlan('per_takeoff', at);
  if (plan === null) {
    throw new ApiError(409, 'CONFLICT', 'Pricing plan is not configured');
  }
  return { plan, isFreeTrial: false };
}

export async function quoteProject(userId: string, projectId: string): Promise<ProjectQuote> {
  const project = await Project.findOne({ _id: projectId, ownerId: userId, deletedAt: null });
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  const at = new Date();
  const resolved = await resolvePlanForQuote(userId, at);
  const plan = resolved.plan;
  const sheets = await DrawingSheet.find({ projectId }).select('inclusion');
  const sheetCount = sheets.length;
  const selectedSheets = sheets.filter((sheet) => sheet.inclusion !== 'excluded').length;
  const maxSheets = plan.parameters.maxSheets;
  const includedSheets =
    maxSheets === undefined ? selectedSheets : Math.min(selectedSheets, maxSheets);
  const excludedSheets = sheetCount - includedSheets;
  const overage =
    plan.code === 'unlimited' && resolved.period !== undefined
      ? (await countBillableJobs(userId, resolved.period.start, resolved.period.end)) >=
        (plan.parameters.includedTakeoffs ?? 0)
      : false;
  const amountMinor = resolved.isFreeTrial
    ? 0
    : plan.code === 'unlimited'
      ? overage
        ? (plan.parameters.overageAmountMinor ?? 0)
        : 0
      : plan.amountMinor;
  const price: PriceQuote = {
    planCode: plan.code,
    planVersion: plan.version,
    amountMinor,
    currency: plan.currency,
    isFreeTrial: resolved.isFreeTrial,
    overage,
  };
  const targetTurnaroundHours = plan.parameters.turnaroundHours ?? DEFAULT_TURNAROUND_HOURS;
  const entitlement =
    maxSheets !== undefined && selectedSheets > maxSheets
      ? {
          allowed: false,
          code: 'ENTITLEMENT_EXCEEDED',
          message: `Project has ${selectedSheets} included sheets but the ${plan.code} plan allows ${maxSheets}`,
        }
      : { allowed: true };
  return {
    projectId,
    sheetCount,
    includedSheets,
    excludedSheets,
    price,
    entitlement,
    targetTurnaroundHours,
    targetDeadlineAt: new Date(at.getTime() + targetTurnaroundHours * 60 * 60 * 1000),
  };
}

export async function quoteProjectForSubmit(
  userId: string,
  projectId: string,
): Promise<ProjectQuote> {
  const quote = await quoteProject(userId, projectId);
  if (!quote.entitlement.allowed) {
    throw new ApiError(
      409,
      'ENTITLEMENT_EXCEEDED',
      quote.entitlement.message ?? 'Entitlement exceeded',
    );
  }
  return quote;
}

export async function getUserUsage(userId: string): Promise<UsageSummary> {
  const at = new Date();
  const user = await User.findById(userId);
  if (user === null) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  const subscription = await getActiveSubscription(userId, at);
  if (subscription !== null) {
    const plan =
      (await getPricingPlan('unlimited', subscription.planVersion)) ??
      (await getEffectivePlan('unlimited', at));
    const used = await countBillableJobs(userId, subscription.periodStart, subscription.periodEnd);
    const includedTakeoffs = plan?.parameters.includedTakeoffs ?? 0;
    const overageCount = Math.max(0, used - includedTakeoffs);
    return {
      planCode: 'unlimited',
      planVersion: subscription.planVersion,
      trialAvailable: false,
      ...(user.freeTrialUsedAt === undefined ? {} : { trialUsedAt: user.freeTrialUsedAt }),
      used,
      includedTakeoffs,
      remaining: Math.max(0, includedTakeoffs - used),
      overageCount,
      overageAmountMinor: overageCount * (plan?.parameters.overageAmountMinor ?? 0),
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      ...(plan === null
        ? {}
        : {
            amountMinor: plan.amountMinor,
            currency: plan.currency,
            maxSheets: plan.parameters.maxSheets,
          }),
    };
  }
  if (user.freeTrialUsedAt === undefined) {
    const trialPlan = await getEffectivePlan('free_trial', at);
    return {
      planCode: 'free_trial',
      trialAvailable: true,
      ...(trialPlan === null
        ? {}
        : {
            planVersion: trialPlan.version,
            maxSheets: trialPlan.parameters.maxSheets,
            amountMinor: trialPlan.amountMinor,
            currency: trialPlan.currency,
          }),
    };
  }
  const plan = await getEffectivePlan('per_takeoff', at);
  return {
    planCode: 'per_takeoff',
    trialAvailable: false,
    trialUsedAt: user.freeTrialUsedAt,
    ...(plan === null
      ? {}
      : {
          planVersion: plan.version,
          amountMinor: plan.amountMinor,
          currency: plan.currency,
          maxSheets: plan.parameters.maxSheets,
        }),
  };
}
