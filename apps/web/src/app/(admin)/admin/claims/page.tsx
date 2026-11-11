import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import { claimStatusLabel, formatDateTime } from '../../../../lib/format';
import { serverApi } from '../../../../lib/server-api';
import type { AccuracyClaim } from '../../../../lib/types';

export const metadata: Metadata = { title: 'Admin · Accuracy claims' };

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

const STATUSES = [
  'submitted',
  'under_review',
  'upheld',
  'rejected',
  'retakeoff_in_progress',
  'resolved',
] as const;

export default async function AdminClaimsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const status = param(params, 'status');
  const query = new URLSearchParams({ limit: '200' });
  if (status.length > 0) {
    query.set('status', status);
  }
  const { claims } = await serverApi<{ claims: AccuracyClaim[] }>(
    `/accuracy-claims?${query.toString()}`,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accuracy claims</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review customer claims, record independent benchmarks and decide whether a claim is
          upheld. Upholding requires every benchmark line within tolerance.
        </p>
      </div>

      <form
        action="/admin/claims"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-slate-200 bg-white p-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium text-slate-800">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {claimStatusLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply filter
        </button>
      </form>

      <p className="text-sm text-slate-600">
        {claims.length} {claims.length === 1 ? 'claim' : 'claims'}
      </p>

      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Claim
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Job
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Reason
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Filed
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {claims.map((claim) => (
              <tr key={claim._id} className="align-top">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/claims/${claim._id}`}
                    className="font-mono text-xs font-medium text-brand-700 hover:underline"
                  >
                    {claim._id}
                  </Link>
                  <p className="font-mono text-[0.7rem] text-slate-500">{claim.projectId}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{claim.jobId}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={claim.status} label={claimStatusLabel(claim.status)} />
                </td>
                <td className="max-w-md px-4 py-3 text-xs text-slate-600">{claim.reason}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDateTime(claim.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={`/admin/claims/${claim._id}`}
                    className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {claims.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  No accuracy claims match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
