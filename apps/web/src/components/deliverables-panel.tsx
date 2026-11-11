'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { deliverableLabel, formatBytes, formatDateTime } from '../lib/format';
import type { Deliverable } from '../lib/types';
import { Button } from './ui/button';

function deliverableFileName(deliverable: Deliverable, projectReference: string): string {
  const suffix = deliverable.type === 'boq_xlsx' ? 'xlsx' : 'pdf';
  const base = deliverable.type === 'boq_xlsx' ? 'BOQ' : 'Annotated-drawings';
  return `${projectReference}-${base}-v${deliverable.version}.${suffix}`;
}

export function DeliverablesPanel({
  deliverables,
  projectReference,
  emptyMessage = 'Deliverables appear here when quality review and compilation are complete.',
}: {
  deliverables: Deliverable[];
  projectReference: string;
  emptyMessage?: string;
}): ReactElement {
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const ready = deliverables.filter((deliverable) => deliverable.status === 'ready');

  async function download(deliverable: Deliverable): Promise<void> {
    setPendingId(deliverable._id);
    setError(undefined);
    try {
      const { url } = await apiFetch<{ url: string }>(`/deliverables/${deliverable._id}/download`);
      const link = document.createElement('a');
      link.href = url;
      link.download = deliverableFileName(deliverable, projectReference);
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not prepare the download.');
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <section
      aria-labelledby="deliverables-heading"
      className="rounded-card border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 id="deliverables-heading" className="text-sm font-semibold text-slate-900">
          Deliverables
        </h2>
      </div>

      {ready.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-600">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {ready.map((deliverable) => (
            <li
              key={deliverable._id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {deliverableLabel(deliverable.type)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Version {deliverable.version}
                  {deliverable.sizeBytes === undefined
                    ? ''
                    : ` · ${formatBytes(deliverable.sizeBytes)}`}
                  {deliverable.createdAt === undefined
                    ? ''
                    : ` · ${formatDateTime(deliverable.createdAt)}`}
                  {deliverable.isTestData ? ' · Test data' : ''}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  void download(deliverable);
                }}
                disabled={pendingId === deliverable._id}
              >
                {pendingId === deliverable._id ? 'Preparing…' : 'Download'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error !== undefined ? (
        <p role="alert" className="px-5 pb-3 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
