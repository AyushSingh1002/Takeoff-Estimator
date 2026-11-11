'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import type { PublicUser } from '../../../lib/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const company = String(form.get('company') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const localErrors: Record<string, string> = {};
    if (name.length === 0) {
      localErrors.name = 'Enter your name.';
    }
    if (!EMAIL_PATTERN.test(email)) {
      localErrors.email = 'Enter a valid email address.';
    }
    if (password.length < 12) {
      localErrors.password = 'Use at least 12 characters.';
    }
    setFieldErrors(localErrors);
    setError(undefined);
    if (Object.keys(localErrors).length > 0) {
      return;
    }

    setPending(true);
    try {
      await apiFetch<{ user: PublicUser }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          ...(company.length === 0 ? {} : { company }),
        }),
      });
      router.replace('/dashboard');
      router.refresh();
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors({
          name: fieldError(caught, 'name') ?? '',
          email: fieldError(caught, 'email') ?? '',
          password: fieldError(caught, 'password') ?? '',
        });
      } else {
        setError('Could not create the account. Please try again.');
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your first takeoff uses the trial allowance. Nothing is charged before you submit.
        </p>
      </div>

      {error !== undefined ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <Field
        label="Name"
        name="name"
        autoComplete="name"
        required
        error={fieldErrors.name === '' ? undefined : fieldErrors.name}
      />
      <Field
        label="Company (optional)"
        name="company"
        autoComplete="organization"
        error={fieldErrors.company === '' ? undefined : fieldErrors.company}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email === '' ? undefined : fieldErrors.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 12 characters. Common passwords are rejected."
        error={fieldErrors.password === '' ? undefined : fieldErrors.password}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
