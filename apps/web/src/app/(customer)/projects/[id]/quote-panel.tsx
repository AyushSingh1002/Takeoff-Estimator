'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { formatDateTime, formatMoney, titleCase } from '../../../../lib/format';
import type { ProjectQuote, TakeoffJob } from '../../../../lib/types';

const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Free trial',
  per_takeoff: 'Per takeoff',
  unlimited: 'Unlimited',
};

export function QuotePanel({
  projectId,
  quote,
  blockers,
}: {
  projectId: string;
  quote: ProjectQuote;
  blockers: string[];
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const disabled = pending || !quote.entitlement.allowed || blockers.length > 0;

  async function submit(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await apiFetch<{ job: TakeoffJob }>(`/projects/${projectId}/submit`, { method: 'POST' });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not submit the takeoff.');
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="quote-heading"
      className="rounded-card border border-slate-200 bg-white p-5"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div>
          <h2 id="quote-heading" className="text-lg font-semibold tracking-tight">
            Price and submission
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-600">Sheets included</dt>
            <dd className="text-right font-medium tabular-nums">{quote.includedSheets}</dd>
            <dt className="text-slate-600">Sheets excluded</dt>
            <dd className="text-right font-medium tabular-nums">{quote.excludedSheets}</dd>
            <dt className="text-slate-600">Plan</dt>
            <dd className="text-right font-medium">
              {PLAN_LABELS[quote.price.planCode] ?? titleCase(quote.price.planCode)}
            </dd>
            <dt className="text-slate-600">Target turnaround</dt>
            <dd className="text-right font-medium tabular-nums">{quote.targetTurnaroundHours} h</dd>
            <dt className="text-slate-600">Target time</dt>
            <dd className="text-right font-medium">{formatDateTime(quote.targetDeadlineAt)}</dd>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Target turnaround is the working target used for scheduling. Nothing is charged until
            you submit.
          </p>
        </div>

        <div className="rounded-card border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Price</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {quote.price.isFreeTrial
              ? 'Free'
              : formatMoney(quote.price.amountMinor, quote.price.currency)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {quote.price.isFreeTrial
              ? 'Your first takeoff is on the free trial.'
              : quote.price.overage
                ? 'This takeoff uses your plan overage rate.'
                : 'Charged on submission.'}
          </p>

          {quote.entitlement.allowed ? null : (
            <p role="alert" className="mt-3 text-xs font-medium text-red-700">
              {quote.entitlement.message ?? 'This project exceeds your plan limit.'}
            </p>
          )}

          {blockers.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-900">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}

          {error !== undefined ? (
            <p role="alert" className="mt-3 text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <Button onClick={submit} disabled={disabled} className="mt-4 w-full">
            {pending ? 'Submitting…' : 'Submit takeoff'}
          </Button>
        </div>
      </div>
    </section>
  );
}
