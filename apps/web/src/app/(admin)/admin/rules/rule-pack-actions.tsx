'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../lib/api';
import type { RulePack } from '../../../../lib/types';

export function RulePackActions({ rulePack }: { rulePack: RulePack }): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState<'approve' | 'retire' | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function run(action: 'approve' | 'retire'): Promise<void> {
    setPending(action);
    setError(undefined);
    try {
      await apiFetch<{ rulePack: RulePack }>(`/admin/rule-packs/${rulePack._id}/${action}`, {
        method: 'POST',
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the rule pack.');
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {rulePack.status === 'draft' ? (
          <Button
            className="px-2 py-1 text-xs"
            disabled={pending !== undefined}
            onClick={() => void run('approve')}
          >
            {pending === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
        ) : null}
        {rulePack.status === 'approved' ? (
          <Button
            variant="danger"
            className="px-2 py-1 text-xs"
            disabled={pending !== undefined}
            onClick={() => void run('retire')}
          >
            {pending === 'retire' ? 'Retiring…' : 'Retire'}
          </Button>
        ) : null}
        {rulePack.status === 'retired' ? (
          <span className="text-xs text-slate-500">Read-only</span>
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
