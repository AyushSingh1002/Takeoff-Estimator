import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import { formatDate, formatDateTime, roleLabel } from '../../../../lib/format';
import { serverApi } from '../../../../lib/server-api';
import type { AdminUser } from '../../../../lib/types';
import { UserActions } from './user-actions';

export const metadata: Metadata = { title: 'Admin · Users' };

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const params = await searchParams;
  const q = param(params, 'q');
  const role = param(params, 'role');
  const isActive = param(params, 'isActive');
  const query = new URLSearchParams({ limit: '200' });
  if (q.length > 0) {
    query.set('q', q);
  }
  if (role.length > 0) {
    query.set('role', role);
  }
  if (isActive.length > 0) {
    query.set('isActive', isActive);
  }
  const { users } = await serverApi<{ users: AdminUser[] }>(`/admin/users?${query.toString()}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search accounts, change roles and deactivate access. Role changes take effect on the next
          request.
        </p>
      </div>

      <form
        action="/admin/users"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-slate-200 bg-white p-4"
      >
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="q" className="block text-sm font-medium text-slate-800">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Name, email or company"
            className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="role" className="block text-sm font-medium text-slate-800">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue={role}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All roles</option>
            <option value="customer">Customer</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="isActive" className="block text-sm font-medium text-slate-800">
            Status
          </label>
          <select
            id="isActive"
            name="isActive"
            defaultValue={isActive}
            className="rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply filters
        </button>
      </form>

      <p className="text-sm text-slate-600">
        {users.length} {users.length === 1 ? 'user' : 'users'}
      </p>

      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                User
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Company
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last login
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Created
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">{user.company ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3">{roleLabel(user.role)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge
                    status={user.isActive ? 'active' : 'cancelled'}
                    label={user.isActive ? 'Active' : 'Deactivated'}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDateTime(user.lastLoginAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <UserActions user={user} />
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No users match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
