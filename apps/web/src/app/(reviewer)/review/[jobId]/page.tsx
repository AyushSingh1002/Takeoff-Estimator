import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import {
  formatDateTime,
  formatQuantity,
  reviewStatusLabel,
  sheetScaleLabel,
  slaCountdown,
  titleCase,
} from '../../../../lib/format';
import { ServerApiError, serverApi } from '../../../../lib/server-api';
import type {
  BoqItem,
  ReviewerDiscrepancy,
  ReviewerJobDetail,
  ReviewerSheet,
} from '../../../../lib/types';
import { BoqReviewTable } from './boq-review-table';
import { DiscrepancyPanel } from './discrepancy-panel';
import { JobActions } from './job-actions';
import { SlaCountdown } from '../sla-countdown';

export const metadata: Metadata = { title: 'Review job' };

function qualityTone(quality: string): string {
  if (quality === 'unreadable') {
    return 'bg-red-50 text-red-800 ring-red-200';
  }
  if (quality === 'degraded') {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  return 'bg-green-50 text-green-800 ring-green-200';
}

async function loadJob(jobId: string): Promise<ReviewerJobDetail> {
  try {
    return await serverApi<ReviewerJobDetail>(`/review/jobs/${jobId}`);
  } catch (error: unknown) {
    if (error instanceof ServerApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}

export default async function ReviewJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<ReactElement> {
  const { jobId } = await params;
  const detail = await loadJob(jobId);
  const [sheetsResponse, boqResponse, discrepanciesResponse] = await Promise.all([
    serverApi<{ sheets: ReviewerSheet[] }>(`/review/jobs/${jobId}/sheets`),
    serverApi<{ boqItems: BoqItem[] }>(`/review/jobs/${jobId}/boq`),
    serverApi<{ discrepancies: ReviewerDiscrepancy[] }>(`/review/jobs/${jobId}/discrepancies`),
  ]);
  const { job, counts, projectReference } = detail;
  const countdown = slaCountdown(job.sla.deadlineAt);
  const canDecide = job.status === 'awaiting_review' || job.status === 'in_review';
  const firstSheet = sheetsResponse.sheets[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/review" className="text-sm text-slate-600 hover:text-brand-700">
            ← Review queue
          </Link>
          <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight">
            {projectReference ?? `Job ${job._id}`}
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {job._id} · submitted {formatDateTime(job.sla.submittedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={job.status} label={reviewStatusLabel(job.status)} />
          {firstSheet === undefined ? null : (
            <Link
              href={`/review/${job._id}/sheets/${encodeURIComponent(firstSheet.id)}`}
              className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Open drawing canvas
            </Link>
          )}
          <JobActions
            jobId={job._id}
            jobStatus={job.status}
            blockingDiscrepancies={counts.blockingDiscrepancies}
            canDecide={canDecide}
            canDeliver={job.status === 'approved'}
          />
        </div>
      </div>

      {job.isTestData === true ? (
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Test data — this job uses the fixture provider. Never approve it as a final customer
          takeoff without replacing the processing provider.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Sheets', counts.sheets],
          ['Objects', counts.objects],
          ['Measurements', counts.measurements],
          ['BOQ lines', counts.boqItems],
          ['Open flags', counts.openDiscrepancies],
          ['Blocking', counts.blockingDiscrepancies],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-slate-200 bg-white px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-slate-200 bg-white px-4 py-3 text-sm">
        <p className="text-slate-600">
          Target deadline <span className="font-medium">{formatDateTime(job.sla.deadlineAt)}</span>
        </p>
        <SlaCountdown
          deadlineAt={job.sla.deadlineAt}
          initialLabel={countdown.label}
          initialTone={countdown.tone}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <section
            aria-labelledby="sheets-heading"
            className="rounded-card border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 id="sheets-heading" className="text-sm font-semibold text-slate-900">
                Sheets
              </h2>
              <p className="text-xs text-slate-500">{sheetsResponse.sheets.length}</p>
            </div>
            {sheetsResponse.sheets.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-600">
                No sheets are attached to this job.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {sheetsResponse.sheets.map((sheet) => (
                  <li key={sheet.id} className="px-4 py-3">
                    <Link
                      href={`/review/${jobId}/sheets/${encodeURIComponent(sheet.id)}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      {sheet.sheetNumber === undefined
                        ? `Page ${sheet.pageNumber}`
                        : `Sheet ${sheet.sheetNumber}`}
                      {sheet.title === undefined ? '' : ` · ${sheet.title}`}
                    </Link>
                    <p className="mt-0.5 font-mono text-[0.7rem] text-slate-500">
                      {sheet.fileName ?? 'Drawing'} · page {sheet.pageNumber}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span
                        className={`inline-flex rounded-full px-1.5 py-0.5 text-[0.7rem] font-medium ring-1 ring-inset ${qualityTone(sheet.quality)}`}
                      >
                        {titleCase(sheet.quality)}
                      </span>
                      <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.7rem] text-slate-700 ring-1 ring-inset ring-slate-200">
                        {sheetScaleLabel(sheet.scale)}
                      </span>
                      {sheet.inclusion === 'excluded' ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.7rem] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                          Excluded
                        </span>
                      ) : null}
                      {sheet.blockingDiscrepancies > 0 ? (
                        <span className="inline-flex rounded-full bg-red-50 px-1.5 py-0.5 text-[0.7rem] font-medium text-red-800 ring-1 ring-inset ring-red-200">
                          {sheet.blockingDiscrepancies} blocking
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[0.7rem] text-slate-500">
                      {sheet.objectCount} objects · {sheet.measurementCount} measurements ·{' '}
                      {sheet.openDiscrepancies} open flags
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DiscrepancyPanel jobId={jobId} discrepancies={discrepanciesResponse.discrepancies} />
        </div>

        <div className="space-y-5">
          <div className="rounded-card border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Review summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              Work the blocking flags first, then verify the quantity ledger and bill lines. Every
              edit writes an audit entry with your note.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-slate-600">Reviewer status</dt>
              <dd className="text-right font-medium">{titleCase(detail.reviewStatus)}</dd>
              <dt className="text-slate-600">Reason</dt>
              <dd className="text-right font-medium">{titleCase(job.reason ?? 'initial')}</dd>
              <dt className="text-slate-600">QA completed</dt>
              <dd className="text-right font-medium">{formatDateTime(job.sla.qaCompletedAt)}</dd>
              <dt className="text-slate-600">Target hours</dt>
              <dd className="text-right font-medium tabular-nums">
                {job.sla.deadlineAt === undefined || job.sla.submittedAt === undefined
                  ? '—'
                  : formatQuantity(
                      (new Date(job.sla.deadlineAt).getTime() -
                        new Date(job.sla.submittedAt).getTime()) /
                        3_600_000,
                    )}
              </dd>
            </dl>
          </div>

          <BoqReviewTable jobId={jobId} boqItems={boqResponse.boqItems} />
        </div>
      </div>
    </div>
  );
}
