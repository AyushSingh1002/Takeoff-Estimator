import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import { formatDate, projectStatusLabel } from '../../../../lib/format';
import { serverApi } from '../../../../lib/server-api';
import type { AdminProjectSummary } from '../../../../lib/types';

export const metadata: Metadata = { title: 'Admin · Projects' };

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const status = param(params, 'status');
  const query = new URLSearchParams({ limit: '200' });
  if (status.length > 0) {
    query.set('status', status);
  }
  const { projects } = await serverApi<{ projects: AdminProjectSummary[] }>(
    `/admin/projects?${query.toString()}`,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-slate-600">
          Customer projects with owner contact and delivery status. Customer contact details stay in
          the admin area.
        </p>
      </div>

      <form
        action="/admin/projects"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-slate-200 bg-white p-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-medium text-slate-800">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply filter
        </button>
      </form>

      <p className="text-sm text-slate-600">
        {projects.length} {projects.length === 1 ? 'project' : 'projects'}
      </p>

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
                Owner
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Region pack
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Created
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Delivered
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map(({ project, ownerEmail }) => (
              <tr key={project._id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-brand-700">
                  {project.reference}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{project.name}</p>
                  <p className="font-mono text-[0.7rem] text-slate-500">{project._id}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-700">{ownerEmail ?? 'Unknown owner'}</p>
                  <p className="font-mono text-[0.7rem] text-slate-500">{project.ownerId}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{project.regionPackCode}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={project.status} label={projectStatusLabel(project.status)} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDate(project.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDate(project.deliveredAt)}
                </td>
              </tr>
            ))}
            {projects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No projects match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
