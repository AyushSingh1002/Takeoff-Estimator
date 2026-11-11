import { randomUUID } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { can } from '../../middleware/policy';
import { AuditLog } from '../audit/audit.model';
import { writeAudit } from '../audit/audit.service';
import { AuthToken, User, type UserRole } from '../auth/auth.model';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { Project } from '../projects/project.model';
import { createProject } from '../projects/project.service';
import { QAReview } from '../review/qaReview.model';
import {
  approveRulePack,
  assignJobReviewer,
  cancelJob,
  createRulePack,
  listAuditLogs,
  listJobs,
  listProjects,
  listRulePacks,
  listUsers,
  retireRulePack,
  rerunJob,
  retryJob,
  updateUser,
} from './admin.service';
import { rulePackCreateBodySchema } from './admin.schemas';
import { RulePack } from './rulePack.model';

async function makeUser(role: UserRole = 'customer'): Promise<string> {
  const user = await User.create({
    email: `admin-test-${randomUUID()}@example.com`,
    passwordHash: 'test-hash',
    name: `Test ${role}`,
    ...(role === 'admin' ? { isActive: true } : {}),
    role,
  });
  return user._id.toString();
}

async function makeJob(input: {
  projectId: string;
  status: 'queued' | 'failed' | 'delivered' | 'review_rejected';
  slaStatus: 'on_track' | 'breached' | 'met';
}): Promise<string> {
  const job = await TakeoffJob.create({
    projectId: input.projectId,
    reason: 'initial',
    status: input.status,
    stages: [
      { name: 'recognize', status: input.status === 'failed' ? 'failed' : 'done', attempts: 3 },
    ],
    sla: { deadlineAt: new Date(), status: input.slaStatus },
    fileIds: [],
  });
  return job._id.toString();
}

describe('admin management (M9)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    process.env.API_BASE_URL = 'http://localhost:4000';
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('takeoff_estimator_m9_admin');
    process.env.STORAGE_BUCKET = 'takeoff-estimator-test';
    process.env.STORAGE_ACCESS_KEY_ID = 'test-access-key';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.PROCESSING_MODE = 'fixture';
    await mongoose.connect(process.env.MONGODB_URI);
    await RulePack.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      AuditLog.deleteMany({}),
      User.deleteMany({}),
      AuthToken.deleteMany({}),
      Project.deleteMany({}),
      TakeoffJob.deleteMany({}),
      QAReview.deleteMany({}),
      RulePack.deleteMany({}),
    ]);
  });

  it('lists, searches and updates users, revoking sessions and auditing changes', async () => {
    const adminId = await makeUser('admin');
    const targetId = await makeUser('customer');
    const target = await User.findById(targetId);
    if (target === null) {
      throw new Error('Expected the target user');
    }
    const session = await AuthToken.create({
      userId: targetId,
      type: 'session',
      tokenHash: `hash-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const page = await listUsers({ limit: 50, offset: 0 });
    expect(page).toHaveLength(2);

    const searched = await listUsers({ q: target.email, limit: 50, offset: 0 });
    expect(searched).toHaveLength(1);
    expect(searched[0]?.id).toBe(targetId);

    const promoted = await updateUser(adminId, targetId, { role: 'reviewer' });
    expect(promoted.role).toBe('reviewer');
    const roleAudit = await AuditLog.findOne({ action: 'role.change', entityId: targetId });
    expect(roleAudit?.before).toEqual({ role: 'customer', isActive: true });
    expect(roleAudit?.after).toEqual({ role: 'reviewer', isActive: true });

    const deactivated = await updateUser(adminId, targetId, { isActive: false });
    expect(deactivated.isActive).toBe(false);
    const revoked = await AuthToken.findById(session._id);
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
    expect(await AuditLog.countDocuments({ action: 'user.update', entityId: targetId })).toBe(1);

    const inactiveReviewers = await listUsers({
      role: 'reviewer',
      isActive: 'false',
      limit: 10,
      offset: 0,
    });
    expect(inactiveReviewers.map((user) => user.id)).toEqual([targetId]);

    await expect(updateUser(adminId, adminId, { isActive: false })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    await expect(updateUser(adminId, adminId, { role: 'customer' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    await expect(
      updateUser(adminId, new mongoose.Types.ObjectId().toString(), { role: 'reviewer' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('filters projects and jobs, retries failed jobs and cancels active jobs', async () => {
    const adminId = await makeUser('admin');
    const customerId = await makeUser('customer');
    const firstProject = await createProject(customerId, { name: 'Admin project one' });
    const secondProject = await createProject(customerId, { name: 'Admin project two' });
    const firstProjectId = firstProject._id.toString();
    const secondProjectId = secondProject._id.toString();
    await Project.updateOne({ _id: secondProjectId }, { status: 'delivered' });

    expect(
      (await listProjects({ status: 'delivered', limit: 50, offset: 0 })).map(({ project }) =>
        project._id.toString(),
      ),
    ).toEqual([secondProjectId]);
    expect(await listProjects({ ownerId: customerId, limit: 50, offset: 0 })).toHaveLength(2);

    const failedJobId = await makeJob({
      projectId: firstProjectId,
      status: 'failed',
      slaStatus: 'breached',
    });
    const queuedJobId = await makeJob({
      projectId: firstProjectId,
      status: 'queued',
      slaStatus: 'on_track',
    });
    const deliveredJobId = await makeJob({
      projectId: secondProjectId,
      status: 'delivered',
      slaStatus: 'met',
    });
    const rejectedJobId = await makeJob({
      projectId: firstProjectId,
      status: 'review_rejected',
      slaStatus: 'on_track',
    });
    await QAReview.create({
      jobId: queuedJobId,
      reviewerId: 'reviewer-1',
      kind: 'primary',
      status: 'assigned',
      assignedBy: adminId,
    });

    expect(
      (await listJobs({ status: 'failed', limit: 50, offset: 0 })).map(({ job }) =>
        job._id.toString(),
      ),
    ).toEqual([failedJobId]);
    expect(
      (await listJobs({ slaStatus: 'breached', limit: 50, offset: 0 })).map(({ job }) =>
        job._id.toString(),
      ),
    ).toEqual([failedJobId]);
    expect(
      (await listJobs({ reviewerId: 'reviewer-1', limit: 50, offset: 0 })).map(({ job }) =>
        job._id.toString(),
      ),
    ).toEqual([queuedJobId]);

    const retried = await retryJob(adminId, failedJobId);
    expect(retried.status).toBe('queued');
    expect(retried.stages[0]?.status).toBe('pending');
    expect(retried.stages[0]?.error).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'job.retry', entityId: failedJobId })).toBe(1);
    await expect(retryJob(adminId, failedJobId)).rejects.toMatchObject({ statusCode: 409 });

    const rerun = await rerunJob(adminId, rejectedJobId);
    expect(rerun.status).toBe('queued');
    expect(rerun.stages.every((stage) => stage.status === 'pending')).toBe(true);
    expect(rerun.stages[0]?.attempts).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'job.rerun', entityId: rejectedJobId })).toBe(1);
    await expect(rerunJob(adminId, rejectedJobId)).rejects.toMatchObject({ statusCode: 409 });
    await expect(rerunJob(adminId, queuedJobId)).rejects.toMatchObject({ statusCode: 409 });

    await expect(cancelJob(adminId, deliveredJobId)).rejects.toMatchObject({ statusCode: 409 });
    const cancelled = await cancelJob(adminId, queuedJobId);
    expect(cancelled.status).toBe('cancelled');
    expect(await AuditLog.countDocuments({ action: 'job.cancel', entityId: queuedJobId })).toBe(1);
    await expect(
      cancelJob(adminId, new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('assigns jobs to active reviewers and enriches project and job summaries', async () => {
    const adminId = await makeUser('admin');
    const customerId = await makeUser('customer');
    const reviewerId = await makeUser('reviewer');
    const inactiveReviewerId = await makeUser('reviewer');
    await User.updateOne({ _id: inactiveReviewerId }, { isActive: false });
    const project = await createProject(customerId, { name: 'Assignment project' });
    const projectId = project._id.toString();
    const jobId = await makeJob({ projectId, status: 'queued', slaStatus: 'on_track' });

    const projectSummaries = await listProjects({
      ownerId: customerId,
      limit: 50,
      offset: 0,
    });
    expect(projectSummaries).toHaveLength(1);
    expect(projectSummaries[0]?.project.reference).toBe(project.reference);
    expect(projectSummaries[0]?.ownerEmail).toBe((await User.findById(customerId))?.email);

    const review = await assignJobReviewer(adminId, jobId, reviewerId);
    expect(review.reviewerId).toBe(reviewerId);
    expect(review.status).toBe('assigned');
    expect(review.startedAt).toBeInstanceOf(Date);
    expect(await AuditLog.countDocuments({ action: 'job.assign', entityId: jobId })).toBe(1);

    const jobSummaries = await listJobs({ reviewerId, limit: 50, offset: 0 });
    expect(jobSummaries).toHaveLength(1);
    expect(jobSummaries[0]?.projectReference).toBe(project.reference);
    expect(jobSummaries[0]?.reviewers).toMatchObject([
      { reviewerId, reviewerEmail: (await User.findById(reviewerId))?.email, status: 'assigned' },
    ]);

    await expect(assignJobReviewer(adminId, jobId, adminId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    await expect(assignJobReviewer(adminId, jobId, inactiveReviewerId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    await expect(
      assignJobReviewer(adminId, jobId, new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    await expect(
      assignJobReviewer(adminId, new mongoose.Types.ObjectId().toString(), reviewerId),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('manages rule packs through draft, approved and retired states', async () => {
    const adminId = await makeUser('admin');
    const input = {
      trade: 'drywall' as const,
      regionPackCode: 'US',
      version: '1.2.0',
      parameters: { sheetAreaM2: 2.88, breakageFactor: 0.05, screwsPerSheet: 32 },
      unitsDisplay: 'metric',
    };

    const draft = await createRulePack(adminId, input);
    expect(draft.status).toBe('draft');
    expect(draft.approvedBy).toBeUndefined();
    expect(
      await AuditLog.countDocuments({ action: 'rulepack.create', entityId: draft._id.toString() }),
    ).toBe(1);
    await expect(createRulePack(adminId, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });

    const approved = await approveRulePack(adminId, draft._id.toString());
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe(adminId);
    expect(approved.approvedAt).toBeInstanceOf(Date);
    await expect(approveRulePack(adminId, draft._id.toString())).rejects.toMatchObject({
      statusCode: 409,
    });

    const retired = await retireRulePack(adminId, draft._id.toString());
    expect(retired.status).toBe('retired');
    await expect(retireRulePack(adminId, draft._id.toString())).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(approveRulePack(adminId, draft._id.toString())).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(await listRulePacks({ trade: 'drywall', status: 'retired' })).toHaveLength(1);
    expect(
      await AuditLog.countDocuments({ action: 'rulepack.approve', entityId: draft._id.toString() }),
    ).toBe(1);
    expect(
      await AuditLog.countDocuments({ action: 'rulepack.retire', entityId: draft._id.toString() }),
    ).toBe(1);

    const wrongParameters = rulePackCreateBodySchema.safeParse({
      trade: 'concrete',
      regionPackCode: 'US',
      version: '1.0.1',
      parameters: { sheetAreaM2: 1 },
    });
    expect(wrongParameters.success).toBe(false);
    const unknownField = rulePackCreateBodySchema.safeParse({
      trade: 'drywall',
      regionPackCode: 'US',
      version: '1.0.2',
      parameters: { screwsPerSheet: 32 },
      unexpected: true,
    });
    expect(unknownField.success).toBe(false);
  });

  it('filters the append-only audit log', async () => {
    const actorId = 'admin-audit';
    await writeAudit({
      at: new Date(Date.now() - 60 * 60 * 1000),
      actorId,
      actorRole: 'admin',
      action: 'pricing.publish',
      entityType: 'PricingPlan',
      entityId: 'plan-1',
    });
    await writeAudit({
      at: new Date(),
      actorId,
      actorRole: 'admin',
      action: 'project.submit',
      entityType: 'TakeoffJob',
      entityId: 'job-1',
      projectId: 'project-1',
    });

    const byAction = await listAuditLogs({ action: 'project.submit', limit: 100 });
    expect(byAction).toHaveLength(1);
    expect(byAction[0]?.entityId).toBe('job-1');

    expect(await listAuditLogs({ actorId, limit: 100 })).toHaveLength(2);
    expect(await listAuditLogs({ entityType: 'PricingPlan', limit: 100 })).toHaveLength(1);
    expect(await listAuditLogs({ projectId: 'project-1', limit: 100 })).toHaveLength(1);
    expect(
      await listAuditLogs({ from: new Date(Date.now() - 30 * 60 * 1000), limit: 100 }),
    ).toHaveLength(1);
    expect(await listAuditLogs({ limit: 1 })).toHaveLength(1);

    expect(can({ id: actorId, role: 'admin' }, 'admin.audit')).toBe(true);
    expect(can({ id: 'customer-1', role: 'customer' }, 'admin.audit')).toBe(false);
    expect(can({ id: 'reviewer-1', role: 'reviewer' }, 'admin.audit')).toBe(false);
    expect(can({ id: 'reviewer-1', role: 'reviewer' }, 'admin.projects')).toBe(false);
  });
});
