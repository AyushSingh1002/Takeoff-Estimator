import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-900">
            Takeoff Estimator
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-brand-700">
            Back to home
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-card border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
