'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../../lib/api';

export function ClaimDecisionForm({ claimId }: { claimId: string }): ReactElement {
  const router = useRouter();
  const [decision, setDecision] = useState<'uphold' | 'reject'>('reject');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    if (note.trim().length === 0) {
      setError('Give a note for the decision record.');
      return;
    }
    setPending(true);
    try {
      await apiFetch(`/admin/accuracy-claims/${claimId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      setNote('');
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not record the decision.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error === undefined ? null : (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor="decision" className="block text-sm font-medium text-slate-800">
          Decision
        </label>
        <select
          id="decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value === 'uphold' ? 'uphold' : 'reject')}
          className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="reject">Reject claim</option>
          <option value="uphold">Uphold claim and schedule re-takeoff</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium text-slate-800">
          Note
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        variant={decision === 'reject' ? 'danger' : 'primary'}
      >
        {pending ? 'Recording…' : decision === 'reject' ? 'Reject claim' : 'Uphold claim'}
      </Button>
    </form>
  );
}
