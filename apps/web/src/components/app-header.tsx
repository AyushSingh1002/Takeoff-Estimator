import Link from 'next/link';
import type { ReactElement } from 'react';
import type { PublicUser } from '../lib/types';
import { LogoutButton } from './logout-button';

export function AppHeader({ user }: { user: PublicUser }): ReactElement {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-slate-900">
            Takeoff Estimator
          </Link>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-slate-700 hover:text-brand-700">
              Projects
            </Link>
            <Link href="/projects/new" className="text-slate-700 hover:text-brand-700">
              New takeoff
            </Link>
            <Link href="/account" className="text-slate-700 hover:text-brand-700">
              Account
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
