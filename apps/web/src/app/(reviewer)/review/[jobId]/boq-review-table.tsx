'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../lib/api';
import { formatQuantity, titleCase } from '../../../../lib/format';
import type { BoqItem } from '../../../../lib/types';

function reviewTone(status: string): string {
  if (status === 'accepted') {
    return 'bg-green-50 text-green-800 ring-green-200';
  }
  if (status === 'corrected') {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  if (status === 'rejected') {
    return 'bg-red-50 text-red-800 ring-red-200';
  }
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function BoqRow({ jobId, item }: { jobId: string; item: BoqItem }): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState<'accept' | 'override' | undefined>();
  const [overriding, setOverriding] = useState(false);
  const [value, setValue] = useState(String(item.quantity));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const pendingReview = item.reviewStatus === 'pending';

  async function accept(): Promise<void> {
    setPending('accept');
    setError(undefined);
    try {
      await apiFetch<{ boqItem: BoqItem }>(`/review/jobs/${jobId}/boq/${item._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'accept' }),
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not accept this line.');
      setPending(undefined);
    }
  }

  async function override(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive quantity.');
      return;
    }
    if (reason.trim().length === 0) {
      setError('Give a reason for the override.');
      return;
    }
    setPending('override');
    setError(undefined);
    try {
      await apiFetch<{ boqItem: BoqItem }>(`/review/jobs/${jobId}/boq/${item._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'override', value: parsed, reason: reason.trim() }),
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not override this line.');
      setPending(undefined);
    }
  }

  return (
    <>
      <tr className="align-top">
        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
          {item.code}
        </td>
        <td className="px-3 py-2 text-slate-900">
          {item.description}
          {item.assumptions.length === 0 ? null : (
            <p className="mt-0.5 text-[0.7rem] text-slate-500">{item.assumptions.join('; ')}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {formatQuantity(item.quantity)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{item.unit}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">
          {formatQuantity(item.wasteFactor * 100)}%
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
          {formatQuantity(item.adjustedQuantity)}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${reviewTone(item.reviewStatus)}`}
          >
            {titleCase(item.reviewStatus)}
          </span>
          {item.override === undefined ? null : (
            <p className="mt-1 text-[0.7rem] text-amber-900">
              Override: {formatQuantity(item.override.value)} · {item.override.reason}
            </p>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {pendingReview ? (
            <div className="flex justify-end gap-1">
              <Button
                variant="secondary"
                onClick={accept}
                disabled={pending !== undefined}
                className="px-2 py-1 text-xs"
              >
                {pending === 'accept' ? 'Saving…' : 'Accept'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOverriding((current) => !current)}
                disabled={pending !== undefined}
                className="px-2 py-1 text-xs"
              >
                Override
              </Button>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Reviewed</span>
          )}
        </td>
      </tr>
      {overriding ? (
        <tr>
          <td colSpan={8} className="bg-amber-50 px-3 py-3">
            <form onSubmit={override} className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-slate-700">
                New quantity
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="mt-1 block w-28 rounded-card border border-slate-300 bg-white px-2 py-1 font-mono text-sm"
                />
              </label>
              <label className="min-w-48 flex-1 text-xs font-medium text-slate-700">
                Reason
                <input
                  type="text"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  className="mt-1 block w-full rounded-card border border-slate-300 bg-white px-2 py-1 text-sm"
                />
              </label>
              <Button type="submit" variant="secondary" disabled={pending !== undefined}>
                {pending === 'override' ? 'Saving…' : 'Save override'}
              </Button>
            </form>
            {error !== undefined ? (
              <p role="alert" className="mt-1 text-xs font-medium text-red-700">
                {error}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function BoqReviewTable({
  jobId,
  boqItems,
}: {
  jobId: string;
  boqItems: BoqItem[];
}): ReactElement {
  const groups = new Map<string, BoqItem[]>();
  for (const item of boqItems) {
    const list = groups.get(item.trade) ?? [];
    list.push(item);
    groups.set(item.trade, list);
  }
  const trades = [...groups.keys()].sort((left, right) => left.localeCompare(right));

  return (
    <section aria-labelledby="review-boq-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="review-boq-heading" className="text-sm font-semibold text-slate-900">
          Bill of quantities review
        </h2>
        <p className="text-xs text-slate-500">
          {boqItems.filter((item) => item.reviewStatus === 'pending').length} pending ·{' '}
          {boqItems.length} lines
        </p>
      </div>
      {boqItems.length === 0 ? (
        <p className="rounded-card border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
          No bill items were produced for this job.
        </p>
      ) : (
        trades.map((trade) => (
          <div
            key={trade}
            className="overflow-x-auto rounded-card border border-slate-200 bg-white"
          >
            <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {titleCase(trade)}
            </h3>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-white text-left text-[0.7rem] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Code
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Unit
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Waste
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Net
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Review
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(groups.get(trade) ?? []).map((item) => (
                  <BoqRow key={item._id} jobId={jobId} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}
