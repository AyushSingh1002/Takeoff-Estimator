import { redirect } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';
import { AccessDenied } from '../../components/access-denied';
import { ReviewerHeader } from '../../components/reviewer-header';
import { isUnauthenticated, serverApi } from '../../lib/server-api';
import type { PublicUser } from '../../lib/types';

export default async function ReviewerLayout({
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

  if (user.role !== 'reviewer') {
    return <AccessDenied user={user} area="reviewer" />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <ReviewerHeader user={user} />
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900 lg:hidden">
        The reviewer workstation is designed for desktop screens. Use a window at least 1024 px wide
        to inspect drawings and overlays comfortably.
      </div>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
