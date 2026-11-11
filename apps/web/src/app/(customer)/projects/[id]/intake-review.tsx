'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { sheetScaleLabel, titleCase } from '../../../../lib/format';
import type { DrawingSheet } from '../../../../lib/types';

function qualityTone(quality: string): string {
  if (quality === 'unreadable') {
    return 'bg-red-50 text-red-800 ring-red-200';
  }
  if (quality === 'degraded') {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  return 'bg-green-50 text-green-800 ring-green-200';
}

function scaleTone(status: string): string {
  if (status === 'missing' || status === 'conflicting') {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function Chip({ children, tone = '' }: { children: string; tone?: string }): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        tone === '' ? 'bg-slate-100 text-slate-700 ring-slate-200' : tone
      }`}
    >
      {children}
    </span>
  );
}

function SheetCard({ projectId, sheet }: { projectId: string; sheet: DrawingSheet }): ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [denominator, setDenominator] = useState(
    sheet.scale.status === 'user_provided' && sheet.scale.ratio !== undefined
      ? String(sheet.scale.ratio)
      : '',
  );
  const included = sheet.inclusion !== 'excluded';

  async function patch(body: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch<{ sheet: DrawingSheet }>(`/projects/${projectId}/sheets/${sheet.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update this sheet.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleInclusion(): Promise<void> {
    await patch({ inclusion: included ? 'excluded' : 'included' });
  }

  async function applyScale(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const value = Number(denominator);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a positive scale number, for example 100 for 1:100.');
      return;
    }
    await patch({ scale: { denominator: value } });
  }

  async function openDrawing(): Promise<void> {
    setError(undefined);
    const popup = window.open('about:blank', '_blank');
    if (popup !== null) {
      popup.opener = null;
    }
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/projects/${projectId}/sheets/${sheet.id}/image`,
      );
      if (popup === null) {
        window.location.href = url;
      } else {
        popup.location.href = url;
      }
    } catch (caught: unknown) {
      popup?.close();
      setError(caught instanceof ApiError ? caught.message : 'Could not open the drawing.');
    }
  }

  return (
    <li
      className={`rounded-card border p-4 ${
        included ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500">
            {sheet.fileName ?? 'Drawing'} · page {sheet.pageNumber}
          </p>
          <p
            className={`mt-1 truncate text-sm font-semibold ${included ? 'text-slate-900' : 'text-slate-500'}`}
          >
            {sheet.sheetNumber === undefined
              ? `Page ${sheet.pageNumber}`
              : `Sheet ${sheet.sheetNumber}`}
            {sheet.title === undefined ? '' : ` · ${sheet.title}`}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={included}
            onChange={toggleInclusion}
            disabled={busy}
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
          />
          Include
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{titleCase(sheet.sheetType)}</Chip>
        <Chip>{titleCase(sheet.discipline)}</Chip>
        <Chip tone={qualityTone(sheet.quality)}>{titleCase(sheet.quality)}</Chip>
        <Chip tone={scaleTone(sheet.scale.status)}>{sheetScaleLabel(sheet.scale)}</Chip>
      </div>

      {sheet.qualityReasons.length > 0 ? (
        <p className="mt-2 text-xs text-amber-800">{sheet.qualityReasons.join(' · ')}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={openDrawing} className="text-xs">
          Open drawing
        </Button>
      </div>

      <form onSubmit={applyScale} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-slate-700">
          Manual scale (1:N)
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={denominator}
            onChange={(event) => setDenominator(event.target.value)}
            disabled={busy}
            className="mt-1 block w-24 rounded-card border border-slate-300 bg-white px-2 py-1 font-mono text-sm"
            aria-label={`Manual scale denominator for page ${sheet.pageNumber}`}
          />
        </label>
        <Button type="submit" variant="secondary" disabled={busy} className="text-xs">
          {busy ? 'Saving…' : 'Set scale'}
        </Button>
      </form>

      {error !== undefined ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function IntakeReview({
  projectId,
  sheets,
}: {
  projectId: string;
  sheets: DrawingSheet[];
}): ReactElement {
  const included = sheets.filter((sheet) => sheet.inclusion !== 'excluded');
  const unreadable = included.filter((sheet) => sheet.quality === 'unreadable');
  const unscaled = included.filter(
    (sheet) => sheet.scale.status === 'missing' || sheet.scale.status === 'conflicting',
  );

  return (
    <section aria-labelledby="intake-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="intake-heading" className="text-lg font-semibold tracking-tight">
            Intake review
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Check the inspection result before submitting. Exclude cover sheets or pages without
            measurable work, and set a scale where it was not detected.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          {included.length} included · {sheets.length - included.length} excluded
        </p>
      </div>

      {unreadable.length > 0 ? (
        <p
          role="alert"
          className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {unreadable.length} included {unreadable.length === 1 ? 'sheet is' : 'sheets are'}{' '}
          unreadable. Exclude {unreadable.length === 1 ? 'it' : 'them'} or upload a clearer drawing
          before submitting.
        </p>
      ) : null}

      {unscaled.length > 0 ? (
        <p
          role="alert"
          className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {unscaled.length} included {unscaled.length === 1 ? 'sheet needs' : 'sheets need'} a
          scale. Enter the drawing scale (1:N) below or exclude the{' '}
          {unscaled.length === 1 ? 'sheet' : 'sheets'}.
        </p>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sheets.map((sheet) => (
          <SheetCard key={sheet.id} projectId={projectId} sheet={sheet} />
        ))}
      </ul>
    </section>
  );
}
