import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage(): ReactElement {
  return <ForgotPasswordForm />;
}
