'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import type { PublicUser } from '../../../lib/types';

export function LoginForm(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const localErrors: Record<string, string> = {};
    if (!email.includes('@')) {
      localErrors.email = 'Enter a valid email address.';
    }
    if (password.length < 12) {
      localErrors.password = 'Password must be at least 12 characters.';
    }
    setFieldErrors(localErrors);
    setError(undefined);
    if (Object.keys(localErrors).length > 0) {
      return;
    }

    setPending(true);
    try {
      const { user } = await apiFetch<{ user: PublicUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.replace(
        user.role === 'admin' ? '/admin/jobs' : user.role === 'reviewer' ? '/review' : '/dashboard',
      );
      router.refresh();
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors({
          email: fieldError(caught, 'email') ?? '',
          password: fieldError(caught, 'password') ?? '',
        });
      } else {
        setError('Could not sign in. Please try again.');
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">
          Use the account your reviewer or administrator provided.
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
        error={fieldErrors.email === '' ? undefined : fieldErrors.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.password === '' ? undefined : fieldErrors.password}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="text-slate-600 hover:text-brand-700">
          Create account
        </Link>
      </div>
    </form>
  );
}
