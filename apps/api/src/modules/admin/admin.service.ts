import { isValidObjectId, type HydratedDocument } from 'mongoose';
import { ApiError } from '../../errors/ApiError';
import { writeAudit } from '../audit/audit.service';
import { AuditLog, type AuditLogAttrs } from '../audit/audit.model';
import { AuthToken, User, type UserAttrs, type UserRole } from '../auth/auth.model';
import { TakeoffJob, type TakeoffJobAttrs } from '../jobs/takeoffJob.model';
import { Project, type ProjectAttrs } from '../projects/project.model';
import { assignReviewer } from '../review/review.service';
import { QAReview, type QAReviewAttrs } from '../review/qaReview.model';
import { RulePack, type RulePackAttrs, type RulePackStatus } from './rulePack.model';
import type {
  AdminJobListQuery,
  AdminProjectListQuery,
  AdminUserListQuery,
  AuditLogQuery,
  RulePackCreateInput,
  RulePackListQuery,
  UpdateUserInput,
} from './admin.schemas';

type UserDoc = HydratedDocument<UserAttrs>;
type ProjectDoc = HydratedDocument<ProjectAttrs>;
type JobDoc = HydratedDocument<TakeoffJobAttrs>;
type ReviewDoc = HydratedDocument<QAReviewAttrs>;
type RulePackDoc = HydratedDocument<RulePackAttrs>;

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  company?: string | undefined;
  role: UserRole;
  isActive: boolean;
  freeTrialUsedAt?: Date | undefined;
  lastLoginAt?: Date | undefined;
  createdAt?: Date | undefined;
}

export interface AdminReviewerAssignment {
  id: string;
  reviewerId: string;
  reviewerName?: string | undefined;
  reviewerEmail?: string | undefined;
  kind: 'primary' | 'second_review';
  status: string;
  startedAt?: Date | undefined;
}

export interface AdminProjectSummary {
  project: ProjectDoc;
  ownerEmail?: string | undefined;
}

export interface AdminJobSummary {
  job: JobDoc;
  projectReference?: string | undefined;
  reviewers: AdminReviewerAssignment[];
}

function toAdminUser(user: UserDoc): AdminUserSummary {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    ...(user.company === undefined ? {} : { company: user.company }),
    role: user.role,
    isActive: user.isActive,
    ...(user.freeTrialUsedAt === undefined ? {} : { freeTrialUsedAt: user.freeTrialUsedAt }),
    ...(user.lastLoginAt === undefined ? {} : { lastLoginAt: user.lastLoginAt }),
    createdAt: user.createdAt,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lookupIds(ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => isValidObjectId(id));
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function listUsers(query: AdminUserListQuery): Promise<AdminUserSummary[]> {
  const filter: Record<string, unknown> = {};
  if (query.role !== undefined) {
    filter.role = query.role;
  }
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true';
  }
  if (query.q !== undefined && query.q.length > 0) {
    const pattern = new RegExp(escapeRegExp(query.q), 'i');
    filter.$or = [{ email: pattern }, { name: pattern }, { company: pattern }];
  }
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(query.offset)
    .limit(query.limit);
  return users.map(toAdminUser);
}

export async function updateUser(
  actorId: string,
  userId: string,
  input: UpdateUserInput,
): Promise<AdminUserSummary> {
  const user = await User.findById(userId);
  if (user === null) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found');
  }
  if (actorId === userId) {
    if (input.isActive === false) {
      throw new ApiError(409, 'CONFLICT', 'Admins cannot deactivate themselves');
    }
    if (input.role !== undefined && input.role !== 'admin') {
      throw new ApiError(409, 'CONFLICT', 'Admins cannot change their own role');
    }
  }
  const before = { role: user.role, isActive: user.isActive };
  if (input.role !== undefined) {
    user.role = input.role;
  }
  if (input.isActive !== undefined) {
    user.isActive = input.isActive;
  }
  await user.save();
  if (input.isActive === false) {
    await AuthToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
  }
  const roleChanged = input.role !== undefined && input.role !== before.role;
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: roleChanged ? 'role.change' : 'user.update',
    entityType: 'User',
    entityId: userId,
    before,
    after: { role: user.role, isActive: user.isActive },
  });
  return toAdminUser(user);
}

export async function listProjects(query: AdminProjectListQuery): Promise<AdminProjectSummary[]> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (query.status !== undefined) {
    filter.status = query.status;
  }
  if (query.ownerId !== undefined) {
    filter.ownerId = query.ownerId;
  }
  const projects = await Project.find(filter)
    .sort({ createdAt: -1 })
    .skip(query.offset)
    .limit(query.limit);
  const ownerIds = lookupIds(projects.map((project) => project.ownerId));
  const owners =
    ownerIds.length === 0 ? [] : await User.find({ _id: { $in: ownerIds } }).select('email');
  const ownerEmails = new Map(owners.map((owner) => [owner._id.toString(), owner.email]));
  return projects.map((project) => ({
    project,
    ...(ownerEmails.has(project.ownerId) ? { ownerEmail: ownerEmails.get(project.ownerId) } : {}),
  }));
}

export async function listJobs(query: AdminJobListQuery): Promise<AdminJobSummary[]> {
  const filter: Record<string, unknown> = {};
  if (query.status !== undefined) {
    filter.status = query.status;
  }
  if (query.slaStatus !== undefined) {
    filter['sla.status'] = query.slaStatus;
  }
  if (query.reviewerId !== undefined) {
    const reviews = await QAReview.find({ reviewerId: query.reviewerId }).select('jobId');
    filter._id = { $in: reviews.map((review) => review.jobId) };
  }
  const jobs = await TakeoffJob.find(filter)
    .sort({ createdAt: -1 })
    .skip(query.offset)
    .limit(query.limit);
  if (jobs.length === 0) {
    return [];
  }
  const jobIds = jobs.map((job) => job._id.toString());
  const projectIds = lookupIds(jobs.map((job) => job.projectId));
  const [projects, reviews] = await Promise.all([
    Project.find({ _id: { $in: projectIds } }).select('reference'),
    QAReview.find({ jobId: { $in: jobIds } }),
  ]);
  const projectReferences = new Map(
    projects.map((project) => [project._id.toString(), project.reference]),
  );
  const reviewerIds = lookupIds(reviews.map((review) => review.reviewerId));
  const reviewers =
    reviewerIds.length === 0
      ? []
      : await User.find({ _id: { $in: reviewerIds } }).select('name email');
  const reviewerMap = new Map(reviewers.map((user) => [user._id.toString(), user]));
  const reviewsByJob = new Map<string, AdminReviewerAssignment[]>();
  for (const review of reviews) {
    const reviewer = reviewerMap.get(review.reviewerId);
    const assignment: AdminReviewerAssignment = {
      id: review._id.toString(),
      reviewerId: review.reviewerId,
      ...(reviewer === undefined ? {} : { reviewerName: reviewer.name }),
      ...(reviewer === undefined ? {} : { reviewerEmail: reviewer.email }),
      kind: review.kind,
      status: review.status,
      ...(review.startedAt === undefined ? {} : { startedAt: review.startedAt }),
    };
    const list = reviewsByJob.get(review.jobId) ?? [];
    list.push(assignment);
    reviewsByJob.set(review.jobId, list);
  }
  return jobs.map((job) => {
    const jobId = job._id.toString();
    return {
      job,
      ...(projectReferences.has(job.projectId)
        ? { projectReference: projectReferences.get(job.projectId) }
        : {}),
      reviewers: reviewsByJob.get(jobId) ?? [],
    };
  });
}

export async function assignJobReviewer(
  actorId: string,
  jobId: string,
  reviewerId: string,
): Promise<ReviewDoc> {
  const reviewer = await User.findById(reviewerId);
  if (reviewer === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Reviewer not found');
  }
  if (reviewer.role !== 'reviewer') {
    throw new ApiError(409, 'CONFLICT', 'Selected user is not a reviewer');
  }
  if (!reviewer.isActive) {
    throw new ApiError(409, 'CONFLICT', 'Reviewer is inactive');
  }
  return assignReviewer({ jobId, reviewerId, assignedBy: actorId });
}

export async function retryJob(actorId: string, jobId: string): Promise<JobDoc> {
  const job = await TakeoffJob.findById(jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  if (job.status !== 'failed') {
    throw new ApiError(409, 'CONFLICT', 'Only failed jobs can be retried');
  }
  const before = { status: job.status };
  for (const stage of job.stages) {
    if (stage.status === 'failed') {
      stage.status = 'pending';
      stage.error = undefined;
      stage.finishedAt = undefined;
    }
  }
  job.status = 'queued';
  job.leaseExpiresAt = undefined;
  await job.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'job.retry',
    entityType: 'TakeoffJob',
    entityId: jobId,
    projectId: job.projectId,
    before,
    after: { status: job.status },
  });
  return job;
}

export async function rerunJob(actorId: string, jobId: string): Promise<JobDoc> {
  const job = await TakeoffJob.findById(jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  if (job.status !== 'review_rejected') {
    throw new ApiError(409, 'CONFLICT', 'Only rejected jobs can be re-run');
  }
  const before = { status: job.status };
  for (const stage of job.stages) {
    stage.status = 'pending';
    stage.attempts = 0;
    stage.startedAt = undefined;
    stage.finishedAt = undefined;
    stage.error = undefined;
  }
  job.status = 'queued';
  job.leaseExpiresAt = undefined;
  job.sla.qaCompletedAt = undefined;
  await job.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'job.rerun',
    entityType: 'TakeoffJob',
    entityId: jobId,
    projectId: job.projectId,
    before,
    after: { status: job.status },
  });
  return job;
}

export async function cancelJob(actorId: string, jobId: string): Promise<JobDoc> {
  const job = await TakeoffJob.findById(jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  if (job.status === 'delivered' || job.status === 'cancelled') {
    throw new ApiError(409, 'CONFLICT', 'Job cannot be cancelled');
  }
  const before = { status: job.status };
  job.status = 'cancelled';
  await job.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'job.cancel',
    entityType: 'TakeoffJob',
    entityId: jobId,
    projectId: job.projectId,
    before,
    after: { status: job.status },
  });
  return job;
}

export async function listRulePacks(query: RulePackListQuery): Promise<RulePackDoc[]> {
  const filter: Record<string, unknown> = {};
  if (query.trade !== undefined) {
    filter.trade = query.trade;
  }
  if (query.status !== undefined) {
    filter.status = query.status;
  }
  if (query.regionPackCode !== undefined) {
    filter.regionPackCode = query.regionPackCode;
  }
  return RulePack.find(filter).sort({ trade: 1, version: -1 });
}

export async function createRulePack(
  actorId: string,
  input: RulePackCreateInput,
): Promise<RulePackDoc> {
  try {
    const rulePack = await RulePack.create({
      trade: input.trade,
      regionPackCode: input.regionPackCode,
      version: input.version,
      status: 'draft' as RulePackStatus,
      parameters: input.parameters,
      ...(input.unitsDisplay === undefined ? {} : { unitsDisplay: input.unitsDisplay }),
      ...(input.engineVersionRange === undefined
        ? {}
        : { engineVersionRange: input.engineVersionRange }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    });
    await writeAudit({
      actorId,
      actorRole: 'admin',
      action: 'rulepack.create',
      entityType: 'RulePack',
      entityId: rulePack._id.toString(),
      after: {
        trade: rulePack.trade,
        regionPackCode: rulePack.regionPackCode,
        version: rulePack.version,
        parameters: rulePack.parameters,
      },
    });
    return rulePack;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ApiError(409, 'CONFLICT', 'Rule pack version already exists');
    }
    throw error;
  }
}

export async function approveRulePack(actorId: string, rulePackId: string): Promise<RulePackDoc> {
  const rulePack = await RulePack.findById(rulePackId);
  if (rulePack === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Rule pack not found');
  }
  if (rulePack.status !== 'draft') {
    throw new ApiError(409, 'CONFLICT', 'Only draft rule packs can be approved');
  }
  rulePack.status = 'approved';
  rulePack.approvedBy = actorId;
  rulePack.approvedAt = new Date();
  await rulePack.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'rulepack.approve',
    entityType: 'RulePack',
    entityId: rulePackId,
    before: { status: 'draft' },
    after: { status: rulePack.status },
  });
  return rulePack;
}

export async function retireRulePack(actorId: string, rulePackId: string): Promise<RulePackDoc> {
  const rulePack = await RulePack.findById(rulePackId);
  if (rulePack === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Rule pack not found');
  }
  if (rulePack.status !== 'approved') {
    throw new ApiError(409, 'CONFLICT', 'Only approved rule packs can be retired');
  }
  rulePack.status = 'retired';
  await rulePack.save();
  await writeAudit({
    actorId,
    actorRole: 'admin',
    action: 'rulepack.retire',
    entityType: 'RulePack',
    entityId: rulePackId,
    before: { status: 'approved' },
    after: { status: rulePack.status },
  });
  return rulePack;
}

export async function listAuditLogs(
  query: AuditLogQuery,
): Promise<HydratedDocument<AuditLogAttrs>[]> {
  const filter: Record<string, unknown> = {};
  if (query.action !== undefined) {
    filter.action = query.action;
  }
  if (query.actorId !== undefined) {
    filter.actorId = query.actorId;
  }
  if (query.entityType !== undefined) {
    filter.entityType = query.entityType;
  }
  if (query.projectId !== undefined) {
    filter.projectId = query.projectId;
  }
  if (query.from !== undefined || query.to !== undefined) {
    const at: Record<string, Date> = {};
    if (query.from !== undefined) {
      at.$gte = query.from;
    }
    if (query.to !== undefined) {
      at.$lte = query.to;
    }
    filter.at = at;
  }
  return AuditLog.find(filter).sort({ at: -1 }).limit(query.limit);
}
