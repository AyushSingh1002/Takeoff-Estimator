import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../components/ui/status-badge';
import { formatDateTime, reviewStatusLabel, slaCountdown } from '../../../lib/format';
import { serverApi } from '../../../lib/server-api';
import type { ReviewerJobSummary } from '../../../lib/types';
import { SlaCountdown } from './sla-countdown';

export const metadata: Metadata = { title: 'Review queue' };

export default async function ReviewQueuePage(): Promise<ReactElement> {
  const { jobs } = await serverApi<{ jobs: ReviewerJobSummary[] }>('/review/jobs');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            Jobs assigned to you. Open a job to inspect sheets, overlays and the quantity ledger.
          </p>
        </div>
        <p className="text-sm text-slate-600">
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} assigned
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-sm font-semibold text-slate-900">No jobs assigned</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            New quality-review work appears here as soon as an administrator assigns it to you.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Project
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Sheets
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Measurements
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Open flags
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Target deadline
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map(({ job, projectReference, counts }) => {
                const countdown = slaCountdown(job.sla.deadlineAt);
                return (
                  <tr key={job._id} className="align-middle">
                    <td className="px-4 py-3">
                      <Link
                        href={`/review/${job._id}`}
                        className="font-mono text-xs font-medium text-brand-700 hover:underline"
                      >
                        {projectReference ?? `Job ${job._id}`}
                      </Link>
                      <p className="mt-0.5 font-mono text-[0.7rem] text-slate-500">{job._id}</p>
                      {job.isTestData === true ? (
                        <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[0.7rem] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                          Test data
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={job.status} label={reviewStatusLabel(job.status)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {counts.sheets}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {counts.measurements}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      <span
                        className={
                          counts.blockingDiscrepancies > 0
                            ? 'font-semibold text-red-700'
                            : 'text-slate-700'
                        }
                      >
                        {counts.openDiscrepancies}
                      </span>
                      {counts.blockingDiscrepancies > 0 ? (
                        <span className="ml-1 text-xs text-red-700">
                          ({counts.blockingDiscrepancies} blocking)
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-xs text-slate-500">{formatDateTime(job.sla.deadlineAt)}</p>
                      <SlaCountdown
                        deadlineAt={job.sla.deadlineAt}
                        initialLabel={countdown.label}
                        initialTone={countdown.tone}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/review/${job._id}`}
                        className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50"
                      >
                        Open job
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
