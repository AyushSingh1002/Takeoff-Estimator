'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../lib/api';
import { titleCase } from '../../../../lib/format';
import type { ReviewerDiscrepancy } from '../../../../lib/types';

function severityTone(severity: string): string {
  if (severity === 'blocking') {
    return 'bg-red-50 text-red-800 ring-red-200';
  }
  if (severity === 'warning') {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function statusTone(status: string): string {
  if (status === 'resolved') {
    return 'bg-green-50 text-green-800 ring-green-200';
  }
  if (status === 'dismissed') {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
  return 'bg-brand-50 text-brand-700 ring-brand-100';
}

function Chip({ children, tone }: { children: string; tone: string }): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {children}
    </span>
  );
}

function DiscrepancyRow({
  jobId,
  discrepancy,
}: {
  jobId: string;
  discrepancy: ReviewerDiscrepancy;
}): ReactElement {
  const router = useRouter();
  const [note, setNote] = useState(discrepancy.note ?? '');
  const [pending, setPending] = useState<'resolve' | 'dismiss' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const open = discrepancy.status === 'open';

  async function decide(decision: 'resolve' | 'dismiss'): Promise<void> {
    if (note.trim().length === 0) {
      setError('Add a note explaining the decision.');
      return;
    }
    setPending(decision);
    setError(undefined);
    try {
      await apiFetch<{ discrepancy: ReviewerDiscrepancy }>(
        `/review/jobs/${jobId}/discrepancies/${discrepancy._id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ decision, note: note.trim() }),
        },
      );
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update this flag.');
      setPending(undefined);
    }
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{titleCase(discrepancy.type)}</p>
          <p className="mt-0.5 font-mono text-[0.7rem] text-slate-500">{discrepancy._id}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Chip tone={severityTone(discrepancy.severity)}>{titleCase(discrepancy.severity)}</Chip>
          <Chip tone={statusTone(discrepancy.status)}>{titleCase(discrepancy.status)}</Chip>
        </div>
      </div>

      {discrepancy.note === undefined ? null : (
        <p className="text-xs text-slate-600">{discrepancy.note}</p>
      )}

      {open ? (
        <div className="space-y-2 rounded-card bg-slate-50 p-2">
          <label
            htmlFor={`note-${discrepancy._id}`}
            className="block text-xs font-medium text-slate-700"
          >
            Decision note
          </label>
          <textarea
            id={`note-${discrepancy._id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-card border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => decide('resolve')}
              disabled={pending !== undefined}
              className="text-xs"
            >
              {pending === 'resolve' ? 'Resolving…' : 'Resolve'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => decide('dismiss')}
              disabled={pending !== undefined}
              className="text-xs"
            >
              {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
            </Button>
          </div>
          {error !== undefined ? (
            <p role="alert" className="text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function DiscrepancyPanel({
  jobId,
  discrepancies,
}: {
  jobId: string;
  discrepancies: ReviewerDiscrepancy[];
}): ReactElement {
  const open = discrepancies.filter((discrepancy) => discrepancy.status === 'open');
  const closed = discrepancies.filter((discrepancy) => discrepancy.status !== 'open');

  return (
    <section
      aria-labelledby="discrepancies-heading"
      className="rounded-card border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 id="discrepancies-heading" className="text-sm font-semibold text-slate-900">
          Flags &amp; discrepancies
        </h2>
        <p className="text-xs text-slate-500">
          {open.length} open · {closed.length} closed
        </p>
      </div>
      {discrepancies.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-600">No discrepancies were raised.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...open, ...closed].map((discrepancy) => (
            <DiscrepancyRow key={discrepancy._id} jobId={jobId} discrepancy={discrepancy} />
          ))}
        </ul>
      )}
    </section>
  );
}
