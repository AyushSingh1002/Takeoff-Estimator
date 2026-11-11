'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { Button } from './ui/button';

export function LogoutButton(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function signOut(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not sign out. Please try again.',
      );
      setPending(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="secondary" onClick={signOut} disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {error !== undefined ? (
        <p role="alert" className="mt-1 max-w-56 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
