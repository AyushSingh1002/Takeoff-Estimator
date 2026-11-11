import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../../components/ui/status-badge';
import {
  benchmarkSourceLabel,
  claimStatusLabel,
  formatDateTime,
  formatQuantity,
} from '../../../../../lib/format';
import { serverApi } from '../../../../../lib/server-api';
import type { AccuracyClaimDetail } from '../../../../../lib/types';
import { BenchmarkForm } from './benchmark-form';
import { ClaimDecisionForm } from './claim-decision-form';

export const metadata: Metadata = { title: 'Admin · Accuracy claim' };

function variance(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export default async function AdminClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const detail = await serverApi<AccuracyClaimDetail>(`/admin/accuracy-claims/${id}`);
  const { claim, benchmark } = detail;
  const canBenchmark =
    benchmark === null && (claim.status === 'submitted' || claim.status === 'under_review');
  const canDecide = benchmark !== null && claim.status === 'under_review';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/claims" className="text-xs text-brand-700 hover:underline">
            ← Accuracy claims
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Claim review</h1>
          <p className="mt-1 font-mono text-xs text-slate-500">{claim._id}</p>
        </div>
        <StatusBadge status={claim.status} label={claimStatusLabel(claim.status)} />
      </div>

      <section className="rounded-card border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Claim</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Project</dt>
            <dd className="font-mono text-xs text-slate-800">{claim.projectId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Job</dt>
            <dd className="font-mono text-xs text-slate-800">{claim.jobId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Filed by</dt>
            <dd className="font-mono text-xs text-slate-800">{claim.filedBy}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Filed at</dt>
            <dd className="text-slate-800">{formatDateTime(claim.createdAt)}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500">Reason</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{claim.reason}</p>
        </div>
        <div className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500">Evidence</h3>
          {claim.evidence.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">No evidence files attached.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {claim.evidence.map((key) => (
                <li key={key} className="break-all font-mono text-xs text-slate-700">
                  {key}
                </li>
              ))}
            </ul>
          )}
        </div>
        {claim.decision === undefined ? null : (
          <div className="mt-4 rounded-card bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">
              Decision recorded {formatDateTime(claim.decision.at)}
            </p>
            <p className="mt-1 text-slate-700">{claim.decision.note}</p>
            <p className="mt-1 font-mono text-[0.7rem] text-slate-500">By {claim.decision.by}</p>
          </div>
        )}
        {claim.retakeoffJobId === undefined ? null : (
          <p className="mt-3 text-sm text-slate-700">
            Re-takeoff job: <span className="font-mono text-xs">{claim.retakeoffJobId}</span>
          </p>
        )}
      </section>

      <section className="rounded-card border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Independent benchmark</h2>
          {benchmark === null ? null : (
            <StatusBadge
              status={benchmark.withinTolerance ? 'active' : 'failed'}
              label={benchmark.withinTolerance ? 'Within ±3% tolerance' : 'Outside tolerance'}
            />
          )}
        </div>

        {benchmark === null ? (
          <p className="mt-2 text-sm text-slate-600">
            No benchmark recorded yet. Benchmark quantities are compared with the delivered BOQ and
            the ±3% tolerance is applied per line.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Source</dt>
                <dd className="text-slate-800">{benchmarkSourceLabel(benchmark.source)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Metric version</dt>
                <dd className="text-slate-800">{benchmark.metricVersion}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Recorded at</dt>
                <dd className="text-slate-800">{formatDateTime(benchmark.createdAt)}</dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Trade
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Code
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Benchmark
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Delivered
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Variance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {benchmark.lines.map((line, index) => (
                    <tr key={`${line.trade}-${line.code}-${index}`}>
                      <td className="px-3 py-2">{line.trade}</td>
                      <td className="px-3 py-2 font-mono text-xs">{line.code}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatQuantity(line.benchmarkQuantity)} {line.unit}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatQuantity(line.deliveredQuantity)} {line.unit}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          Math.abs(line.variancePct) > 3 ? 'font-semibold text-red-700' : ''
                        }`}
                      >
                        {variance(line.variancePct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {canBenchmark ? (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <BenchmarkForm claimId={claim._id} />
          </div>
        ) : null}
      </section>

      {canDecide ? (
        <section className="rounded-card border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Decision</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upholding creates a zero-charge re-takeoff job and is only available when every
            benchmark line is within tolerance.
          </p>
          <div className="mt-4">
            <ClaimDecisionForm claimId={claim._id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
