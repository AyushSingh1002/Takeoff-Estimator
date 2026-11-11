import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const raw = params.token;
  const token = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return <ResetPasswordForm token={token} tokenValid={token.length >= 32 && token.length <= 256} />;
}
