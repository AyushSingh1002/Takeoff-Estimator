'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../lib/api';
import type { AdminJobSummary, AdminUser } from '../../../../lib/types';

type Operation = 'assign' | 'retry' | 'rerun' | 'cancel';

export function JobActions({
  summary,
  reviewers,
}: {
  summary: AdminJobSummary;
  reviewers: AdminUser[];
}): ReactElement {
  const router = useRouter();
  const currentReviewerId = summary.reviewers[0]?.reviewerId ?? '';
  const [reviewerId, setReviewerId] = useState(currentReviewerId);
  const [pending, setPending] = useState<Operation | undefined>();
  const [error, setError] = useState<string | undefined>();
  const job = summary.job;

  async function run(operation: Operation, path: string, body?: unknown): Promise<void> {
    setPending(operation);
    setError(undefined);
    try {
      await apiFetch(path, {
        method: 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the job.');
    } finally {
      setPending(undefined);
    }
  }

  const canCancel = job.status !== 'delivered' && job.status !== 'cancelled';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`reviewer-${job._id}`} className="sr-only">
          Reviewer for {summary.projectReference ?? job._id}
        </label>
        <select
          id={`reviewer-${job._id}`}
          value={reviewerId}
          onChange={(event) => setReviewerId(event.target.value)}
          disabled={pending !== undefined}
          className="max-w-44 rounded-card border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          <option value="">Select reviewer</option>
          {reviewers.map((reviewer) => (
            <option key={reviewer.id} value={reviewer.id}>
              {reviewer.name}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={pending !== undefined || reviewerId.length === 0}
          onClick={() => void run('assign', `/admin/jobs/${job._id}/assign`, { reviewerId })}
        >
          {pending === 'assign' ? 'Assigning…' : 'Assign'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {job.status === 'failed' ? (
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={pending !== undefined}
            onClick={() => void run('retry', `/admin/jobs/${job._id}/retry`)}
          >
            {pending === 'retry' ? 'Retrying…' : 'Retry failed stage'}
          </Button>
        ) : null}
        {job.status === 'review_rejected' ? (
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={pending !== undefined}
            onClick={() => void run('rerun', `/admin/jobs/${job._id}/rerun`)}
          >
            {pending === 'rerun' ? 'Re-running…' : 'Re-run job'}
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            variant="danger"
            className="px-2 py-1 text-xs"
            disabled={pending !== undefined}
            onClick={() => void run('cancel', `/admin/jobs/${job._id}/cancel`)}
          >
            {pending === 'cancel' ? 'Cancelling…' : 'Cancel job'}
          </Button>
        ) : null}
      </div>

      {error === undefined ? null : (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
