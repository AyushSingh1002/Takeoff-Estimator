'use client';

import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';

export function DeleteFileButton({
  projectId,
  fileId,
  fileName,
}: {
  projectId: string;
  fileId: string;
  fileName: string;
}): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function remove(): Promise<void> {
    if (!window.confirm(`Remove ${fileName} from this project?`)) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await apiFetch<{ ok: true }>(`/projects/${projectId}/files/${fileId}`, { method: 'DELETE' });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not remove the file.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="ghost" onClick={remove} disabled={pending} className="text-xs">
        {pending ? 'Removing…' : 'Remove'}
      </Button>
      {error !== undefined ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
