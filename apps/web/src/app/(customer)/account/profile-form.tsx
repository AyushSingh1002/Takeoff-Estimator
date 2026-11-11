'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import type { PublicUser } from '../../../lib/types';

export function ProfileForm({ user }: { user: PublicUser }): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const company = String(form.get('company') ?? '').trim();
    setError(undefined);
    setSuccess(undefined);
    if (name.length === 0) {
      setFieldErrors({ name: 'Enter your name.' });
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      await apiFetch<{ user: PublicUser }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, company }),
      });
      setSuccess('Profile updated.');
      router.refresh();
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors({
          name: fieldError(caught, 'name') ?? '',
          company: fieldError(caught, 'company') ?? '',
        });
      } else {
        setError('Could not update your profile.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error === undefined ? null : (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {success === undefined ? null : (
        <p role="status" className="rounded-card bg-green-50 px-3 py-2 text-sm text-green-800">
          {success}
        </p>
      )}

      <Field
        label="Name"
        name="name"
        autoComplete="name"
        defaultValue={user.name}
        error={fieldErrors.name === '' ? undefined : fieldErrors.name}
      />
      <Field
        label="Company (optional)"
        name="company"
        autoComplete="organization"
        defaultValue={user.company ?? ''}
        error={fieldErrors.company === '' ? undefined : fieldErrors.company}
      />
      <Field
        label="Email"
        name="email"
        defaultValue={user.email}
        disabled
        hint="Email changes are not available yet."
      />

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}
