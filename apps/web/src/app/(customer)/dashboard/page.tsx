import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../components/ui/status-badge';
import { formatDate, projectStatusLabel } from '../../../lib/format';
import { serverApi } from '../../../lib/server-api';
import type { ProjectSummary } from '../../../lib/types';

export const metadata: Metadata = { title: 'Projects' };

export default async function DashboardPage(): Promise<ReactElement> {
  const { projects } = await serverApi<{ projects: ProjectSummary[] }>('/projects');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">
            Each project holds one drawing set and its delivered bill of quantities.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New takeoff
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-sm font-semibold text-slate-900">Create your first takeoff</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Upload a drawing set. You will see the intake report, price and target turnaround before
            anything is submitted.
          </p>
          <Link
            href="/projects/new"
            className="mt-4 inline-block rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create project
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Reference
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Project
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Created
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                    {project.reference}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {project.name}
                    </Link>
                    <p className="text-xs text-slate-500">{project.regionPackCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={project.status}
                      label={projectStatusLabel(project.status)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDate(project.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
