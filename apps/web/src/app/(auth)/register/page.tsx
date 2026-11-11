import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage(): ReactElement {
  return <RegisterForm />;
}
