import { redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';
import { AccessDenied } from '../../components/access-denied';
import { AppHeader } from '../../components/app-header';
import { isUnauthenticated, serverApi } from '../../lib/server-api';
import type { PublicUser } from '../../lib/types';

export default async function CustomerLayout({
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

  if (user.role !== 'customer') {
    return <AccessDenied user={user} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
