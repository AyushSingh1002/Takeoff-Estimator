'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../lib/api';
import type { AdminUser, Role } from '../../../../lib/types';

const ROLES: Role[] = ['customer', 'reviewer', 'admin'];

export function UserActions({ user }: { user: AdminUser }): ReactElement {
  const router = useRouter();
  const [role, setRole] = useState<Role>(user.role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function patch(body: { role?: Role; isActive?: boolean }): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await apiFetch<{ user: AdminUser }>(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the user.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`role-${user.id}`} className="sr-only">
          Role for {user.email}
        </label>
        <select
          id={`role-${user.id}`}
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          disabled={pending}
          className="rounded-card border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          {ROLES.map((option) => (
            <option key={option} value={option}>
              {option === 'admin'
                ? 'Administrator'
                : option === 'reviewer'
                  ? 'Reviewer'
                  : 'Customer'}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={pending || role === user.role}
          onClick={() => void patch({ role })}
        >
          Save role
        </Button>
        <Button
          variant={user.isActive ? 'danger' : 'secondary'}
          className="px-2 py-1 text-xs"
          disabled={pending}
          onClick={() => void patch({ isActive: !user.isActive })}
        >
          {user.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </div>
      {error === undefined ? null : (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
