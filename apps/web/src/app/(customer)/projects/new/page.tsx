import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { NewProjectForm } from './new-project-form';

export const metadata: Metadata = { title: 'New takeoff' };

export default function NewProjectPage(): ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-600 hover:text-brand-700">
          ← Projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New takeoff</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create the draft, upload the drawing set, then review the intake before submitting.
        </p>
      </div>
      <NewProjectForm />
    </div>
  );
}
