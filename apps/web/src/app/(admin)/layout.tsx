import { redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';
import { AccessDenied } from '../../components/access-denied';
import { AdminHeader } from '../../components/admin-header';
import { isUnauthenticated, serverApi } from '../../lib/server-api';
import type { PublicUser } from '../../lib/types';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  let user: PublicUser;
  try {
    user = (await serverApi<{ user: PublicUser }>('/me')).user;
  } catch (error: unknown) {
    if (isUnauthenticated(error)) {
      redirect('/login');
    }
    throw error;
  }

  if (user.role !== 'admin') {
    return <AccessDenied user={user} area="admin" />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
