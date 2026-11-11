'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

/** Refresh server data while a worker-owned status can still change. */
export function AutoRefresh({ enabled }: { enabled: boolean }): ReactElement | null {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = window.setInterval(() => {
      router.refresh();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, router]);

  return null;
}
