import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import {
  formatDateTime,
  reviewStatusLabel,
  slaCountdown,
  slaStatusLabel,
} from '../../../../lib/format';
import { serverApi } from '../../../../lib/server-api';
import type { AdminJobSummary, AdminUser } from '../../../../lib/types';
import { JobActions } from './job-actions';

export const metadata: Metadata = { title: 'Admin · Jobs' };

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

const JOB_STATUS_OPTIONS = [
  'queued',
  'processing',
  'awaiting_review',
  'in_review',
  'review_rejected',
  'approved',
  'compiling',
  'delivered',
  'failed',
  'cancelled',
] as const;

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const status = param(params, 'status');
  const slaStatus = param(params, 'slaStatus');
  const reviewerId = param(params, 'reviewerId');
  const query = new URLSearchParams({ limit: '200' });
  if (status.length > 0) {
    query.set('status', status);
  }
  if (slaStatus.length > 0) {
    query.set('slaStatus', slaStatus);
  }
  if (reviewerId.length > 0) {
    query.set('reviewerId', reviewerId);
  }
  const [{ jobs }, { users: reviewers }] = await Promise.all([
    serverApi<{ jobs: AdminJobSummary[] }>(`/admin/jobs?${query.toString()}`),
    serverApi<{ users: AdminUser[] }>('/admin/users?role=reviewer&isActive=true&limit=200'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Monitor processing and SLA status, assign reviewers, and recover failed or rejected jobs.
        </p>
      </div>

      <form
        action="/admin/jobs"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-slate-200 bg-white p-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium text-slate-800">
            Job status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {JOB_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {reviewStatusLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="slaStatus" className="block text-sm font-medium text-slate-800">
            SLA
          </label>
          <select
            id="slaStatus"
            name="slaStatus"
            defaultValue={slaStatus}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All SLA states</option>
            <option value="on_track">On track</option>
            <option value="at_risk">At risk</option>
            <option value="breached">Breached</option>
            <option value="met">Met</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="reviewerId" className="block text-sm font-medium text-slate-800">
            Reviewer
          </label>
          <select
            id="reviewerId"
            name="reviewerId"
            defaultValue={reviewerId}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All reviewers</option>
            {reviewers.map((reviewer) => (
              <option key={reviewer.id} value={reviewer.id}>
                {reviewer.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply filters
        </button>
      </form>

      <p className="text-sm text-slate-600">
        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
      </p>

      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Job
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                SLA
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Reviewers
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((summary) => {
              const job = summary.job;
              const countdown = slaCountdown(job.sla.deadlineAt);
              return (
                <tr key={job._id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-medium text-brand-700">
                      {summary.projectReference ?? 'Project reference unavailable'}
                    </p>
                    <p className="font-mono text-[0.7rem] text-slate-500">{job._id}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.reason === 'accuracy_retakeoff'
                        ? 'Accuracy re-takeoff'
                        : job.reason === 'rerun'
                          ? 'Re-run'
                          : 'Initial takeoff'}
                    </p>
                    {job.isTestData === true ? (
                      <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[0.7rem] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                        Test data — not a customer deliverable
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={job.status} label={reviewStatusLabel(job.status)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-slate-700">{slaStatusLabel(job.sla.status)}</p>
                    <p className="text-xs text-slate-500">{countdown.label}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(job.sla.deadlineAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {summary.reviewers.length === 0 ? (
                      <p className="text-xs text-slate-500">Unassigned</p>
                    ) : (
                      <ul className="space-y-1">
                        {summary.reviewers.map((assignment) => (
                          <li key={assignment.id} className="text-xs">
                            <p className="font-medium text-slate-800">
                              {assignment.reviewerName ?? assignment.reviewerId}
                            </p>
                            <p className="text-slate-500">
                              {assignment.status.replace('_', ' ')}
                              {assignment.reviewerEmail === undefined
                                ? ''
                                : ` · ${assignment.reviewerEmail}`}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <JobActions summary={summary} reviewers={reviewers} />
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No jobs match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
