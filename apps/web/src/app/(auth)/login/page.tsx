import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage(): ReactElement {
  return <LoginForm />;
}
