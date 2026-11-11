'use client';

import Link from 'next/link';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';

export function ForgotPasswordForm(): ReactElement {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    if (!email.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(undefined);
    setError(undefined);
    setPending(true);
    try {
      await apiFetch<{ ok: true }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setEmailError(fieldError(caught, 'email'));
      } else {
        setError('Could not send the reset email. Please try again.');
      }
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          If an account exists for that address, a single-use reset link has been sent. The link
          expires in 60 minutes.
        </p>
        <Link href="/login" className="inline-block text-sm text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-600">
          We will email a single-use link if the address belongs to an account.
        </p>
      </div>

      {error !== undefined ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={emailError}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>

      <p className="text-center text-sm text-slate-600">
        <Link href="/login" className="text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
