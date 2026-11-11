'use client';

import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';

export function PasswordForm(): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    const localErrors: Record<string, string> = {};
    if (newPassword.length < 12) {
      localErrors.newPassword = 'Use at least 12 characters.';
    }
    if (newPassword !== confirmPassword) {
      localErrors.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(localErrors);
    setError(undefined);
    setSuccess(undefined);
    if (Object.keys(localErrors).length > 0) {
      return;
    }

    setPending(true);
    try {
      await apiFetch<{ ok: true }>('/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      formElement.reset();
      setSuccess('Password changed.');
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors({
          currentPassword: fieldError(caught, 'currentPassword') ?? '',
          newPassword: fieldError(caught, 'newPassword') ?? '',
        });
      } else {
        setError('Could not change your password.');
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
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.currentPassword === '' ? undefined : fieldErrors.currentPassword}
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 12 characters."
        error={fieldErrors.newPassword === '' ? undefined : fieldErrors.newPassword}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.confirmPassword === '' ? undefined : fieldErrors.confirmPassword}
      />

      <Button type="submit" disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}
