import Link from 'next/link';
import type { ReactElement } from 'react';
import type { PublicUser } from '../lib/types';
import { LogoutButton } from './logout-button';

const LINKS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/projects', label: 'Projects' },
  { href: '/admin/jobs', label: 'Jobs' },
  { href: '/admin/pricing', label: 'Pricing' },
  { href: '/admin/rules', label: 'Rule packs' },
  { href: '/admin/claims', label: 'Accuracy claims' },
] as const;

export function AdminHeader({ user }: { user: PublicUser }): ReactElement {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-6">
          <Link href="/admin/jobs" className="text-sm font-semibold tracking-tight text-slate-900">
            Takeoff Estimator · Admin
          </Link>
          <nav aria-label="Administration" className="flex flex-wrap items-center gap-4 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-slate-700 hover:text-brand-700"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">Administrator</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
