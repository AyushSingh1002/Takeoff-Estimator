'use client';

import { useRouter } from 'next/navigation';
import type { ChangeEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../../../lib/api';
import { formatBytes } from '../../../../lib/format';
import { Button } from '../../../../components/ui/button';
import type { UploadTarget } from '../../../../lib/types';

const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 50;

type ItemState = 'queued' | 'uploading' | 'completing' | 'done' | 'error';

interface UploadItem {
  key: string;
  name: string;
  size: number;
  state: ItemState;
  message?: string;
}

function contentTypeFor(file: File): string | undefined {
  if (Object.values(ALLOWED_TYPES).includes(file.type)) {
    return file.type;
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_TYPES[extension];
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Upload failed. Please try again.';
}

export function FileUploader({ projectId }: { projectId: string }): ReactElement {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [pending, setPending] = useState(false);

  async function uploadOne(file: File, key: string): Promise<void> {
    const contentType = contentTypeFor(file);
    if (contentType === undefined) {
      setItems((current) =>
        current.map((item) =>
          item.key === key ? { ...item, state: 'error', message: 'Unsupported file type.' } : item,
        ),
      );
      return;
    }
    try {
      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, state: 'uploading' } : item)),
      );
      const { fileId, upload } = await apiFetch<{ fileId: string; upload: UploadTarget }>(
        `/projects/${projectId}/files`,
        {
          method: 'POST',
          body: JSON.stringify({
            originalName: file.name,
            contentType,
            sizeBytes: file.size,
          }),
        },
      );

      const response = await fetch(upload.url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Storage rejected the upload (${response.status}).`);
      }

      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, state: 'completing' } : item)),
      );
      await apiFetch<{ file: unknown }>(`/projects/${projectId}/files/${fileId}/complete`, {
        method: 'POST',
      });
      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, state: 'done' } : item)),
      );
    } catch (error: unknown) {
      setItems((current) =>
        current.map((item) =>
          item.key === key
            ? {
                ...item,
                state: 'error',
                message: error instanceof ApiError ? error.message : messageFor(error),
              }
            : item,
        ),
      );
    }
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length === 0) {
      return;
    }

    const accepted: { item: UploadItem; file: File }[] = [];
    const rejected: UploadItem[] = [];
    for (const file of selected) {
      const key = crypto.randomUUID();
      if (file.size > MAX_BYTES) {
        rejected.push({
          key,
          name: file.name,
          size: file.size,
          state: 'error',
          message: `Larger than ${formatBytes(MAX_BYTES)}.`,
        });
      } else if (contentTypeFor(file) === undefined) {
        rejected.push({
          key,
          name: file.name,
          size: file.size,
          state: 'error',
          message: 'Use PDF, TIFF, JPEG, PNG or WebP.',
        });
      } else {
        accepted.push({
          item: { key, name: file.name, size: file.size, state: 'queued' },
          file,
        });
      }
    }

    if (items.filter((item) => item.state !== 'error').length + accepted.length > MAX_FILES) {
      rejected.push({
        key: crypto.randomUUID(),
        name: 'Selection not uploaded',
        size: 0,
        state: 'error',
        message: `A project accepts up to ${MAX_FILES} files.`,
      });
    } else {
      setItems((current) => [...current, ...accepted.map(({ item }) => item), ...rejected]);
      setPending(true);
      for (const { item, file } of accepted) {
        await uploadOne(file, item.key);
      }
      setPending(false);
      router.refresh();
    }
  }

  return (
    <section
      aria-labelledby="upload-heading"
      className="rounded-card border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="upload-heading" className="text-sm font-semibold text-slate-900">
            Upload drawings
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            PDF, TIFF, JPEG, PNG or WebP · up to {formatBytes(MAX_BYTES)} each · up to {MAX_FILES}{' '}
            files.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-70">
          <span>{pending ? 'Uploading…' : 'Choose files'}</span>
          <input
            type="file"
            multiple
            accept=".pdf,.tif,.tiff,.jpg,.jpeg,.png,.webp,application/pdf,image/tiff,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onChange}
            disabled={pending}
          />
        </label>
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {items.map((item, index) => (
            <li
              key={`${item.key}-${index}`}
              className="flex items-start justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(item.size)}
                  {item.message === undefined ? '' : ` · ${item.message}`}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs font-medium ${
                  item.state === 'error'
                    ? 'text-red-700'
                    : item.state === 'done'
                      ? 'text-green-700'
                      : 'text-slate-500'
                }`}
              >
                {item.state === 'queued'
                  ? 'Queued'
                  : item.state === 'uploading'
                    ? 'Uploading'
                    : item.state === 'completing'
                      ? 'Registering'
                      : item.state === 'done'
                        ? 'Uploaded'
                        : 'Failed'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {items.some((item) => item.state === 'done') ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Ingestion runs in the worker. This page refreshes while files are being inspected.
          </p>
          <Button variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </div>
      ) : null}
    </section>
  );
}
