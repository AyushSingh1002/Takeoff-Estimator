import type { ReactElement } from 'react';
import type { PublicUser } from '../lib/types';
import { LogoutButton } from './logout-button';

export type ProtectedArea = 'customer' | 'reviewer' | 'admin';

const AREA_COPY: Record<ProtectedArea, { title: string; body: string }> = {
  customer: {
    title: 'Customer area only',
    body: 'Sign in with a customer account to manage projects and download deliverables.',
  },
  reviewer: {
    title: 'Reviewer area only',
    body: 'Sign in with a reviewer account to work the quality-review queue.',
  },
  admin: {
    title: 'Administrator area only',
    body: 'Sign in with an administrator account to manage users, jobs and pricing.',
  },
};

export function AccessDenied({
  user,
  area = 'customer',
}: {
  user: PublicUser;
  area?: ProtectedArea;
}): ReactElement {
  const copy = AREA_COPY[area];
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-card border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You are signed in as <span className="font-medium">{user.role}</span>. {copy.body}
          </p>
          <div className="mt-5">
            <LogoutButton />
          </div>
        </div>
      </main>
    </div>
  );
}
