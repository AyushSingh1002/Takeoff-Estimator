'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../lib/api';
import { reviewStatusLabel } from '../../../../lib/format';

export function JobActions({
  jobId,
  jobStatus,
  blockingDiscrepancies,
  canDecide,
  canDeliver,
}: {
  jobId: string;
  jobStatus: string;
  blockingDiscrepancies: number;
  canDecide: boolean;
  canDeliver: boolean;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState<'approve' | 'reject' | 'deliver' | undefined>();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function deliver(): Promise<void> {
    setPending('deliver');
    setError(undefined);
    try {
      await apiFetch<{ deliverables: unknown[] }>(`/jobs/${jobId}/deliver`, { method: 'POST' });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not compile the deliverables.');
      setPending(undefined);
    }
  }

  async function approve(): Promise<void> {
    setPending('approve');
    setError(undefined);
    try {
      await apiFetch<{ job: unknown }>(`/review/jobs/${jobId}/approve`, { method: 'POST' });
      router.replace('/review');
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not approve the job.');
      setPending(undefined);
      if (caught instanceof ApiError && caught.status === 502) {
        router.refresh();
      }
    }
  }

  async function reject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (reason.trim().length === 0) {
      setError('Give a reason so the administrator can re-run or fix the job.');
      return;
    }
    setPending('reject');
    setError(undefined);
    try {
      await apiFetch<{ job: unknown }>(`/review/jobs/${jobId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      router.replace('/review');
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reject the job.');
      setPending(undefined);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canDeliver ? (
          <Button onClick={deliver} disabled={pending !== undefined}>
            {pending === 'deliver' ? 'Compiling…' : 'Compile deliverables'}
          </Button>
        ) : (
          <Button onClick={approve} disabled={pending !== undefined || !canDecide}>
            {pending === 'approve' ? 'Approving…' : 'Approve job'}
          </Button>
        )}
        <Button
          variant="danger"
          onClick={() => setRejecting((current) => !current)}
          disabled={pending !== undefined || !canDecide}
        >
          Reject job
        </Button>
      </div>
      {canDeliver ? (
        <p className="text-xs text-slate-600">
          Approved, but deliverables are not compiled yet. Compile them to deliver the BOQ and
          annotated drawings to the customer.
        </p>
      ) : null}
      {blockingDiscrepancies > 0 ? (
        <p className="text-xs font-medium text-red-700">
          {blockingDiscrepancies} blocking {blockingDiscrepancies === 1 ? 'flag' : 'flags'} must be
          resolved or dismissed before approval.
        </p>
      ) : null}
      {!canDecide ? (
        <p className="text-xs text-slate-500">
          This job is {reviewStatusLabel(jobStatus).toLowerCase()} and cannot be approved or
          rejected from here.
        </p>
      ) : null}

      {rejecting ? (
        <form onSubmit={reject} className="rounded-card border border-red-200 bg-red-50 p-3">
          <label htmlFor="reject-reason" className="block text-xs font-medium text-red-900">
            Rejection reason (visible to administrators only)
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full rounded-card border border-red-300 bg-white px-2 py-1.5 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="submit" variant="danger" disabled={pending !== undefined}>
              {pending === 'reject' ? 'Rejecting…' : 'Confirm rejection'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejecting(false)}
              disabled={pending !== undefined}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error !== undefined ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
