import Link from 'next/link';
import type { ReactElement } from 'react';
import type { PublicUser } from '../lib/types';
import { LogoutButton } from './logout-button';

export function ReviewerHeader({ user }: { user: PublicUser }): ReactElement {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/review" className="text-sm font-semibold tracking-tight text-slate-900">
            Takeoff Estimator · QA
          </Link>
          <nav aria-label="Review" className="flex items-center gap-4 text-sm">
            <Link href="/review" className="text-slate-700 hover:text-brand-700">
              Review queue
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">Reviewer</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
