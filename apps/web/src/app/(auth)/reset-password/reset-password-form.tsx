'use client';

import Link from 'next/link';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';

export function ResetPasswordForm({
  token,
  tokenValid,
}: {
  token: string;
  tokenValid: boolean;
}): ReactElement {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!tokenValid) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Reset link is incomplete</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          This page needs the token from your reset email. Request a new link to continue.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm text-brand-700 hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          All existing sessions were signed out. Use your new password to sign in.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const localErrors: Record<string, string> = {};
    if (password.length < 12) {
      localErrors.password = 'Use at least 12 characters.';
    }
    if (confirm !== password) {
      localErrors.confirm = 'Passwords do not match.';
    }
    setFieldErrors(localErrors);
    setError(undefined);
    if (Object.keys(localErrors).length > 0) {
      return;
    }

    setPending(true);
    try {
      await apiFetch<{ ok: true }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors({ password: fieldError(caught, 'password') ?? '' });
      } else {
        setError('Could not reset the password. Please try again.');
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-600">
          The reset link works once, then must be replaced.
        </p>
      </div>

      {error !== undefined ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 12 characters. Common passwords are rejected."
        error={fieldErrors.password === '' ? undefined : fieldErrors.password}
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.confirm === '' ? undefined : fieldErrors.confirm}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
