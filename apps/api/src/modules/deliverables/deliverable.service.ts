import { createHash } from 'crypto';
import { HydratedDocument } from 'mongoose';
import { loadEnv } from '../../config/env';
import { ApiError } from '../../errors/ApiError';
import { writeAudit } from '../audit/audit.service';
import { BoqItem, type BoqItemAttrs } from '../pipeline/boqItem.model';
import { Measurement } from '../pipeline/measurement.model';
import { TakeoffJob } from '../jobs/takeoffJob.model';
import { evaluateSla, getLatestJobByProject } from '../jobs/job.service';
import { Project } from '../projects/project.model';
import { QAReview } from '../review/qaReview.model';
import { resolveClaimForRetakeoffJob } from '../accuracy/accuracy.service';
import { Deliverable, type DeliverableAttrs, type DeliverableType } from './deliverable.model';
import { generateAnnotatedPdf } from './annotatedPdf';
import { generateBoqWorkbook } from './excel';

type DeliverableDoc = HydratedDocument<DeliverableAttrs>;
type BoqItemDoc = HydratedDocument<BoqItemAttrs>;

export const DELIVERABLE_TEMPLATE_VERSION = 'deliverables.v1';

export async function listDeliverablesForProject(projectId: string): Promise<DeliverableDoc[]> {
  return Deliverable.find({ projectId }).sort({ createdAt: -1 });
}

export async function listDeliveredBoq(projectId: string): Promise<BoqItemDoc[]> {
  const job = await getLatestJobByProject(projectId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  if (job.status !== 'delivered') {
    throw new ApiError(409, 'CONFLICT', 'Project has no delivered BOQ yet');
  }
  return BoqItem.find({ jobId: job._id.toString() });
}

export async function compileDeliverables(input: {
  jobId: string;
  actorId: string;
  actorRole: 'reviewer' | 'admin';
  storage: { put(key: string, body: Buffer, contentType: string): Promise<void> };
}): Promise<DeliverableDoc[]> {
  const job = await TakeoffJob.findById(input.jobId);
  if (job === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Job not found');
  }
  if (input.actorRole === 'reviewer') {
    const assignment = await QAReview.findOne({ jobId: input.jobId, reviewerId: input.actorId });
    if (assignment === null) {
      throw new ApiError(403, 'FORBIDDEN', 'Reviewer not assigned');
    }
  }
  if (job.status !== 'approved' && job.status !== 'compiling' && job.status !== 'delivered') {
    throw new ApiError(409, 'CONFLICT', 'Job must be approved before delivery');
  }
  const env = loadEnv();
  const isTestData = env.PROCESSING_MODE === 'fixture';
  const boqItems = await BoqItem.find({ jobId: input.jobId });
  const measurements = await Measurement.find({ jobId: input.jobId });
  const deliverables: DeliverableDoc[] = [];
  // USER_FLOWS §2 state machine: approved → compiling → delivered. A failed
  // compile returns to `approved` so the customer sees "Preparing
  // deliverables" and delivery can be retried.
  const startedFromApproved = job.status === 'approved';
  if (startedFromApproved) {
    job.status = 'compiling';
    await job.save();
  }
  try {
    for (const type of ['boq_xlsx', 'annotated_pdf'] as DeliverableType[]) {
      const latest = await Deliverable.findOne({ jobId: input.jobId, type }).sort({ version: -1 });
      const version = (latest?.version ?? 0) + 1;
      const storageKey = `deliverables/${input.jobId}/${type}/v${version}`;
      const content =
        type === 'boq_xlsx'
          ? await generateBoqWorkbook({ boqItems, measurements, isTestData })
          : await generateAnnotatedPdf({ measurements, isTestData });
      const sha256 = createHash('sha256').update(content).digest('hex');
      await input.storage.put(
        storageKey,
        content,
        type === 'boq_xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
      );
      const deliverable = await Deliverable.create({
        projectId: job.projectId,
        jobId: job._id.toString(),
        type,
        status: 'ready',
        storageKey,
        sizeBytes: content.length,
        sha256,
        version,
        isTestData,
        generatedBy: DELIVERABLE_TEMPLATE_VERSION,
      });
      if (latest !== null) {
        await Deliverable.updateOne({ _id: latest._id }, { status: 'superseded' });
      }
      deliverables.push(deliverable);
    }
  } catch (error: unknown) {
    if (startedFromApproved) {
      job.status = 'approved';
      await job.save();
    }
    throw error;
  }
  job.status = 'delivered';
  job.sla.deliveredAt = new Date();
  await job.save();
  await Project.updateOne(
    { _id: job.projectId },
    { status: 'delivered', deliveredAt: job.sla.deliveredAt },
  );
  const deliveredJob = await evaluateSla(input.jobId);
  await writeAudit({
    actorId: input.actorId,
    actorRole: 'reviewer',
    action: 'job.deliver',
    entityType: 'TakeoffJob',
    entityId: input.jobId,
    projectId: job.projectId,
    after: { status: deliveredJob.status, deliverableTypes: ['boq_xlsx', 'annotated_pdf'] },
  });
  await resolveClaimForRetakeoffJob(input.jobId);
  return deliverables;
}

export async function getDeliverableOrThrow(deliverableId: string): Promise<DeliverableDoc> {
  const deliverable = await Deliverable.findById(deliverableId);
  if (deliverable === null) {
    throw new ApiError(404, 'NOT_FOUND', 'Deliverable not found');
  }
  return deliverable;
}

export async function downloadDeliverable(input: {
  deliverableId: string;
  actorId: string;
  actorRole: 'customer' | 'reviewer' | 'admin';
  storage: { presignGet(key: string, ttlSeconds: number): Promise<string> };
}): Promise<{ url: string; expiresIn: number }> {
  const deliverable = await getDeliverableOrThrow(input.deliverableId);
  if (input.actorRole === 'customer') {
    const project = await Project.findOne({
      _id: deliverable.projectId,
      ownerId: input.actorId,
      deletedAt: null,
    });
    if (project === null) {
      throw new ApiError(404, 'NOT_FOUND', 'Deliverable not found');
    }
  } else if (input.actorRole !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
  }
  const ttlSeconds = loadEnv().SIGNED_URL_TTL_SECONDS;
  const url = await input.storage.presignGet(deliverable.storageKey, ttlSeconds);
  await writeAudit({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: 'deliverable.download',
    entityType: 'Deliverable',
    entityId: deliverable._id.toString(),
    projectId: deliverable.projectId,
    after: {
      storageKey: deliverable.storageKey,
      version: deliverable.version,
      expiresIn: ttlSeconds,
    },
  });
  return { url, expiresIn: ttlSeconds };
}
