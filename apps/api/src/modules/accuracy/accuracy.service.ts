import type { HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { writeAudit } from '../audit/audit.service';
import { BoqItem } from '../pipeline/boqItem.model';
import { TakeoffJob, type TakeoffJobAttrs } from '../jobs/takeoffJob.model';
import { createJob, DEFAULT_JOB_TURNAROUND_HOURS } from '../jobs/job.service';
import { Project } from '../projects/project.model';
import { getEffectivePlan } from '../pricing/pricing.service';
import {
  ACCURACY_CLAIM_WINDOW_DAYS,
  ACCURACY_METRIC_VERSION,
  computeVariance,
} from './accuracy.metrics';
import {
  AccuracyBenchmark,
  type AccuracyBenchmarkAttrs,
  type AccuracyBenchmarkLine,
} from './accuracyBenchmark.model';
import {
  AccuracyClaim,
  type AccuracyClaimAttrs,
  type AccuracyClaimStatus,
} from './accuracyClaim.model';
import type {
  AccuracyClaimListQuery,
  ClaimDecisionInput,
  FileAccuracyClaimInput,
  RecordBenchmarkInput,
} from './accuracy.schemas';

export type AccuracyClaimDoc = HydratedDocument<AccuracyClaimAttrs>;
export type AccuracyBenchmarkDoc = HydratedDocument<AccuracyBenchmarkAttrs>;
export type TakeoffJobDoc = HydratedDocument<TakeoffJobAttrs>;

const OPEN_CLAIM_STATUSES: readonly AccuracyClaimStatus[] = [
  'submitted',
  'under_review',
  'upheld',
  'retakeoff_in_progress',
];

export interface ClaimActor {
  id: string;
  role: 'customer' | 'reviewer' | 'admin';
}

export interface ClaimDecisionResult {
  claim: AccuracyClaimDoc;
  job: TakeoffJobDoc | null;
}

export async function fileAccuracyClaim(
  userId: string,
  projectId: string,
  input: FileAccuracyClaimInput,
): Promise<AccuracyClaimDoc> {
  const project = await Project.findOne({ _id: projectId, ownerId: userId, deletedAt: null });
  if (project === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Project not found');
  }
  const job = await TakeoffJob.findOne({ _id: input.jobId, projectId });
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  if (job.status !== 'delivered') {
    throw new ApiError(409, 'CONFLICT', 'Claims can only be filed on delivered jobs');
  }
  const deliveredAt = job.sla.deliveredAt ?? project.deliveredAt;
  if (deliveredAt === undefined) {
    throw new ApiError(409, 'CONFLICT', 'Job has no delivery date');
  }
  const windowMs = ACCURACY_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > deliveredAt.getTime() + windowMs) {
    throw new ApiError(409, 'CONFLICT', 'The accuracy claim window has expired');
  }
  const evidencePrefix = `projects/${projectId}/`;
  const invalidEvidence = input.evidence.find((key) => !key.startsWith(evidencePrefix));
  if (invalidEvidence !== undefined) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Evidence must be stored under the project', [
      { path: 'evidence', issue: 'forbidden_prefix' },
    ]);
  }
  const existing = await AccuracyClaim.findOne({
    jobId: input.jobId,
    status: { $in: OPEN_CLAIM_STATUSES },
  });
  if (existing !== null) {
    throw new ApiError(409, 'CONFLICT', 'An active claim already exists for this job');
  }
  const claim = await AccuracyClaim.create({
    jobId: input.jobId,
    projectId,
    filedBy: userId,
    status: 'submitted' as AccuracyClaimStatus,
    reason: input.reason,
    evidence: input.evidence,
  });
  await writeAudit({
    actorId: userId,
    actorRole: 'customer',
    action: 'accuracy.claim.create',
    entityType: 'AccuracyClaim',
    entityId: claim._id.toString(),
    projectId,
    after: {
      jobId: claim.jobId,
      status: claim.status,
      evidenceCount: claim.evidence.length,
    },
  });
  return claim;
}

export async function listAccuracyClaims(
  actor: ClaimActor,
  query: AccuracyClaimListQuery,
): Promise<AccuracyClaimDoc[]> {
  const filter: Record<string, unknown> = {};
  if (actor.role !== 'admin') {
    filter.filedBy = actor.id;
  }
  if (query.status !== undefined) {
    filter.status = query.status;
  }
  if (query.jobId !== undefined) {
    filter.jobId = query.jobId;
  }
  return AccuracyClaim.find(filter).sort({ createdAt: -1 }).skip(query.offset).limit(query.limit);
}

export interface AccuracyClaimDetail {
  claim: AccuracyClaimDoc;
  benchmark: AccuracyBenchmarkDoc | null;
}

export async function getAccuracyClaimDetail(claimId: string): Promise<AccuracyClaimDetail> {
  const claim = await AccuracyClaim.findById(claimId);
  if (claim === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Accuracy claim not found');
  }
  const benchmark =
    claim.benchmarkId === undefined ? null : await AccuracyBenchmark.findById(claim.benchmarkId);
  return { claim, benchmark };
}

async function sumDeliveredQuantity(input: {
  jobId: string;
  trade: string;
  code: string;
  unit: string;
  lineIndex: number;
}): Promise<number> {
  const items = await BoqItem.find({
    jobId: input.jobId,
    trade: input.trade,
    code: input.code,
  });
  if (items.length === 0) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Benchmark line does not match a BOQ item', [
      { path: `lines.${input.lineIndex}.code`, issue: 'not_found' },
    ]);
  }
  const units = new Set(items.map((item) => item.unit));
  if (units.size !== 1 || !units.has(input.unit)) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Benchmark unit does not match the BOQ unit', [
      { path: `lines.${input.lineIndex}.unit`, issue: 'unit_mismatch' },
    ]);
  }
  return items.reduce((total, item) => total + (item.override?.value ?? item.quantity), 0);
}

export async function recordAccuracyBenchmark(
  actorId: string,
  claimId: string,
  input: RecordBenchmarkInput,
): Promise<AccuracyBenchmarkDoc> {
  const claim = await AccuracyClaim.findById(claimId);
  if (claim === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Accuracy claim not found');
  }
  if (claim.status !== 'submitted' && claim.status !== 'under_review') {
    throw new ApiError(409, 'CONFLICT', 'Claim is not open for benchmarking');
  }
  const lines: AccuracyBenchmarkLine[] = [];
  let withinTolerance = true;
  for (const [index, line] of input.lines.entries()) {
    const deliveredQuantity = await sumDeliveredQuantity({
      jobId: claim.jobId,
      trade: line.trade,
      code: line.code,
      unit: line.unit,
      lineIndex: index,
    });
    const variance = computeVariance(line.benchmarkQuantity, deliveredQuantity);
    withinTolerance = withinTolerance && variance.withinTolerance;
    lines.push({
      trade: line.trade,
      code: line.code,
      benchmarkQuantity: line.benchmarkQuantity,
      unit: line.unit,
      deliveredQuantity,
      variancePct: variance.variancePct,
    });
  }
  const benchmark = await AccuracyBenchmark.create({
    jobId: claim.jobId,
    source: input.source,
    benchmarkBy: actorId,
    lines,
    metricVersion: input.metricVersion ?? ACCURACY_METRIC_VERSION,
    withinTolerance,
  });
  claim.benchmarkId = benchmark._id.toString();
  claim.status = 'under_review';
  await claim.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'accuracy.benchmark',
    entityType: 'AccuracyBenchmark',
    entityId: benchmark._id.toString(),
    projectId: claim.projectId,
    after: {
      claimId,
      source: benchmark.source,
      metricVersion: benchmark.metricVersion,
      withinTolerance: benchmark.withinTolerance,
      lineCount: benchmark.lines.length,
    },
  });
  return benchmark;
}

export async function decideAccuracyClaim(
  actorId: string,
  claimId: string,
  input: ClaimDecisionInput,
): Promise<ClaimDecisionResult> {
  const claim = await AccuracyClaim.findById(claimId);
  if (claim === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Accuracy claim not found');
  }
  if (claim.status !== 'under_review') {
    throw new ApiError(409, 'CONFLICT', 'Claim is not awaiting a decision');
  }
  if (claim.benchmarkId === undefined) {
    throw new ApiError(409, 'CONFLICT', 'Record a benchmark before deciding the claim');
  }
  const benchmark = await AccuracyBenchmark.findById(claim.benchmarkId);
  if (benchmark === null) {
    throw new ApiError(409, 'CONFLICT', 'Record a benchmark before deciding the claim');
  }
  const decision = { by: actorId, note: input.note, at: new Date() };

  if (input.decision === 'reject') {
    claim.status = 'rejected';
    claim.decision = decision;
    await claim.save();
    await writeAudit({
      actorId,
      actorRole: 'admin',
      action: 'accuracy.claim.reject',
      entityType: 'AccuracyClaim',
      entityId: claimId,
      projectId: claim.projectId,
      after: { status: claim.status, note: input.note },
    });
    return { claim, job: null };
  }

  if (!benchmark.withinTolerance) {
    throw new ApiError(409, 'CONFLICT', 'Benchmark is outside the accuracy tolerance');
  }
  const parentJob = await TakeoffJob.findById(claim.jobId);
  if (parentJob === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Original job not found');
  }
  const plan = await getEffectivePlan('per_takeoff');
  const turnaroundHours = plan?.parameters.turnaroundHours ?? DEFAULT_JOB_TURNAROUND_HOURS;
  const priceQuote =
    parentJob.priceQuote === undefined
      ? undefined
      : {
          ...parentJob.priceQuote,
          amountMinor: 0,
          isFreeTrial: false,
          overage: false,
        };
  const job = await createJob({
    projectId: claim.projectId,
    fileIds: parentJob.fileIds,
    sheetIds: parentJob.sheetIds ?? [],
    reason: 'accuracy_retakeoff',
    parentJobId: claim.jobId,
    turnaroundHours,
    ...(priceQuote === undefined ? {} : { priceQuote }),
  });
  claim.status = 'retakeoff_in_progress';
  claim.retakeoffJobId = job._id.toString();
  claim.decision = decision;
  await claim.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'accuracy.claim.uphold',
    entityType: 'AccuracyClaim',
    entityId: claimId,
    projectId: claim.projectId,
    after: {
      status: claim.status,
      retakeoffJobId: claim.retakeoffJobId,
      parentJobId: claim.jobId,
      note: input.note,
    },
  });
  return { claim, job };
}

export async function resolveClaimForRetakeoffJob(retakeoffJobId: string): Promise<void> {
  const claim = await AccuracyClaim.findOne({
    retakeoffJobId,
    status: 'retakeoff_in_progress',
  });
  if (claim === null) {
    return;
  }
  claim.status = 'resolved';
  await claim.save();
  await writeAudit({
    actorId: 'system',
    actorRole: 'system',
    action: 'accuracy.claim.resolve',
    entityType: 'AccuracyClaim',
    entityId: claim._id.toString(),
    projectId: claim.projectId,
    after: { status: claim.status, retakeoffJobId },
  });
}
