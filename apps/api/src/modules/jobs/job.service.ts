import { HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { loadEnv } from '../../config/env';
import { runStageByName } from '../pipeline/pipeline.service';
import type { PriceQuote } from '../pricing/pricingPlan.model';
import {
  TakeoffJob,
  type JobReason,
  type JobSlaStatus,
  type JobStage,
  type JobStageName,
  type TakeoffJobAttrs,
} from './takeoffJob.model';

export type TakeoffJobDoc = HydratedDocument<TakeoffJobAttrs>;

export const JOB_STAGE_NAMES: readonly JobStageName[] = [
  'recognize',
  'measure',
  'convert',
  'verify',
];
export const DEFAULT_JOB_TURNAROUND_HOURS = 24;

export type CustomerProgressStage =
  'processing' | 'review' | 'preparing' | 'ready' | 'delayed' | 'cancelled';

export interface CustomerJobProgress {
  stage: CustomerProgressStage;
  label: string;
}

export function mapCustomerProgress(status: TakeoffJobAttrs['status']): CustomerJobProgress {
  switch (status) {
    case 'queued':
    case 'processing':
      return { stage: 'processing', label: 'Processing drawings' };
    case 'awaiting_review':
    case 'in_review':
    case 'review_rejected':
      return { stage: 'review', label: 'Quality review' };
    case 'approved':
    case 'compiling':
      return { stage: 'preparing', label: 'Preparing deliverables' };
    case 'delivered':
      return { stage: 'ready', label: 'Ready' };
    case 'failed':
      return { stage: 'delayed', label: 'Delayed — we are looking into it' };
    case 'cancelled':
      return { stage: 'cancelled', label: 'Cancelled' };
  }
}

export async function createJob(input: {
  projectId: string;
  fileIds: string[];
  reason: JobReason;
  sheetIds?: string[];
  parentJobId?: string;
  priceQuote?: PriceQuote;
  turnaroundHours?: number;
}): Promise<TakeoffJobDoc> {
  const submittedAt = new Date();
  const turnaroundHours = input.turnaroundHours ?? DEFAULT_JOB_TURNAROUND_HOURS;
  const job = await TakeoffJob.create({
    projectId: input.projectId,
    ...(input.parentJobId === undefined ? {} : { parentJobId: input.parentJobId }),
    reason: input.reason,
    status: 'queued',
    stages: JOB_STAGE_NAMES.map((name) => ({ name, status: 'pending' as const, attempts: 0 })),
    sla: {
      submittedAt,
      deadlineAt: new Date(submittedAt.getTime() + turnaroundHours * 60 * 60 * 1000),
      status: 'on_track',
    },
    ...(input.priceQuote === undefined ? {} : { priceQuote: input.priceQuote }),
    fileIds: input.fileIds,
    sheetIds: input.sheetIds ?? [],
    isTestData: loadEnv().PROCESSING_MODE === 'fixture',
  });
  return job;
}

export async function getJobById(jobId: string): Promise<TakeoffJobDoc | null> {
  const job = await TakeoffJob.findById(jobId);
  return job;
}

export async function getLatestJobByProject(projectId: string): Promise<TakeoffJobDoc | null> {
  const jobs = await TakeoffJob.find({ projectId }).sort({ createdAt: -1 }).limit(1);
  const latest = jobs[0];
  if (latest === undefined) {
    return null;
  }
  return latest;
}

export async function claimNextJob(): Promise<TakeoffJobDoc | null> {
  const env = loadEnv();
  const now = new Date();
  const claimed = await TakeoffJob.findOneAndUpdate(
    {
      $or: [{ status: 'queued' }, { status: 'processing', leaseExpiresAt: { $lt: now } }],
    },
    {
      status: 'processing',
      leaseExpiresAt: new Date(now.getTime() + env.JOB_LEASE_SECONDS * 1000),
      'sla.processingStartedAt': now,
      'sla.status': 'on_track',
    },
    { new: true },
  ).sort({ createdAt: 1 });
  if (claimed === null) {
    return null;
  }
  await resetRunningStages(claimed._id.toString());
  return claimed;
}

async function resetRunningStages(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (job === null) {
    return;
  }
  let changed = false;
  for (const stage of job.stages) {
    if (stage.status !== 'running') {
      continue;
    }
    stage.status = 'pending';
    stage.startedAt = undefined;
    stage.finishedAt = undefined;
    stage.error = undefined;
    changed = true;
  }
  if (changed) {
    await job.save();
  }
}

async function getJobOrThrow(jobId: string): Promise<TakeoffJobDoc> {
  const job = await getJobById(jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  return job;
}

export async function startStage(jobId: string, stageName: JobStageName): Promise<JobStage> {
  const job = await getJobOrThrow(jobId);
  const stage = job.stages.find((candidate) => candidate.name === stageName);
  if (stage === undefined) {
    throw new ApiError(404, 'NOT_FOUND', 'Stage not found');
  }
  if (stage.status === 'done') {
    throw new ApiError(409, 'CONFLICT', 'Stage already complete');
  }
  const wasPendingish = stage.status === 'pending' || stage.status === 'failed';
  stage.status = 'running';
  stage.startedAt = new Date();
  stage.finishedAt = undefined;
  stage.error = undefined;
  if (wasPendingish) {
    stage.attempts += 1;
  }
  await job.save();
  return stage;
}

export async function finishStage(jobId: string, stageName: JobStageName): Promise<TakeoffJobDoc> {
  const job = await getJobOrThrow(jobId);
  const stage = job.stages.find((candidate) => candidate.name === stageName);
  if (stage === undefined) {
    throw new ApiError(404, 'NOT_FOUND', 'Stage not found');
  }
  stage.status = 'done';
  stage.finishedAt = new Date();
  stage.error = undefined;
  const allDone = job.stages.every((candidate) => candidate.status === 'done');
  if (allDone) {
    job.status = 'awaiting_review';
  }
  await job.save();
  return job;
}

export async function failStage(
  jobId: string,
  stageName: JobStageName,
  error: string,
): Promise<TakeoffJobDoc> {
  const job = await getJobOrThrow(jobId);
  const stage = job.stages.find((candidate) => candidate.name === stageName);
  if (stage === undefined) {
    throw new ApiError(404, 'NOT_FOUND', 'Stage not found');
  }
  stage.status = 'failed';
  stage.error = error;
  stage.finishedAt = new Date();
  if (stage.attempts >= loadEnv().JOB_MAX_ATTEMPTS) {
    job.status = 'failed';
  }
  await job.save();
  return job;
}

export async function retryStage(jobId: string, stageName: JobStageName): Promise<TakeoffJobDoc> {
  const job = await getJobOrThrow(jobId);
  const stage = job.stages.find((candidate) => candidate.name === stageName);
  if (stage === undefined) {
    throw new ApiError(404, 'NOT_FOUND', 'Stage not found');
  }
  if (stage.status !== 'failed') {
    throw new ApiError(409, 'CONFLICT', 'Stage is not failed');
  }
  if (stage.attempts >= loadEnv().JOB_MAX_ATTEMPTS) {
    throw new ApiError(409, 'CONFLICT', 'Retry budget exhausted');
  }
  stage.status = 'pending';
  stage.error = undefined;
  stage.finishedAt = undefined;
  stage.startedAt = undefined;
  await job.save();
  return job;
}

export async function evaluateSla(jobId: string): Promise<TakeoffJobDoc> {
  const job = await getJobOrThrow(jobId);
  const submittedAtMs = job.sla.submittedAt?.getTime();
  const deadlineMs = job.sla.deadlineAt.getTime();
  let status: JobSlaStatus = 'on_track';
  if (job.sla.deliveredAt !== undefined) {
    status = 'met';
  } else if (Date.now() > deadlineMs) {
    status = 'breached';
  } else if (submittedAtMs !== undefined) {
    const windowMs = deadlineMs - submittedAtMs;
    if (windowMs > 0 && Date.now() - submittedAtMs > windowMs * 0.75) {
      status = 'at_risk';
    }
  }
  job.sla.status = status;
  await job.save();
  return job;
}

export async function runNextStage(jobId: string): Promise<TakeoffJobDoc> {
  const job = await getJobOrThrow(jobId);
  const nextStage = job.stages.find((candidate) => candidate.status !== 'done');
  if (nextStage === undefined) {
    job.status = 'awaiting_review';
    await job.save();
    return job;
  }
  const started = await startStage(jobId, nextStage.name);
  const outcome = await runStageByName(jobId, nextStage.name);
  if (!outcome.ok) {
    return failStage(jobId, started.name, outcome.error);
  }
  return finishStage(jobId, started.name);
}
