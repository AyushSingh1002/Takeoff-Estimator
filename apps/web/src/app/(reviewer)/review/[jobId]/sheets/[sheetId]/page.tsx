import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../../../components/ui/status-badge';
import { reviewStatusLabel, sheetScaleLabel, titleCase } from '../../../../../../lib/format';
import { ServerApiError, serverApi } from '../../../../../../lib/server-api';
import type {
  ReviewerJobDetail,
  ReviewerSheet,
  ReviewerSheetDetail,
} from '../../../../../../lib/types';
import { DiscrepancyPanel } from '../../discrepancy-panel';
import { MeasurementEditor } from './measurement-editor';
import { SheetCanvas } from './sheet-canvas';

export const metadata: Metadata = { title: 'Review sheet' };

async function load<T>(path: string): Promise<T> {
  try {
    return await serverApi<T>(path);
  } catch (error: unknown) {
    if (error instanceof ServerApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}

export default async function ReviewSheetPage({
  params,
}: {
  params: Promise<{ jobId: string; sheetId: string }>;
}): Promise<ReactElement> {
  const { jobId, sheetId } = await params;
  const [jobDetail, detail, sheetsResponse] = await Promise.all([
    load<ReviewerJobDetail>(`/review/jobs/${jobId}`),
    load<ReviewerSheetDetail>(`/review/jobs/${jobId}/sheets/${encodeURIComponent(sheetId)}`),
    load<{ sheets: ReviewerSheet[] }>(`/review/jobs/${jobId}/sheets`),
  ]);
  const { job } = jobDetail;
  const sheets = sheetsResponse.sheets;
  const index = sheets.findIndex((sheet) => sheet.id === sheetId || sheet.sheetRef === sheetId);
  const previous = index > 0 ? sheets[index - 1] : undefined;
  const next = index >= 0 && index < sheets.length - 1 ? sheets[index + 1] : undefined;
  const sheet = detail.sheet;
  const testData = job.isTestData === true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/review/${jobId}`} className="text-sm text-slate-600 hover:text-brand-700">
            ← {jobDetail.projectReference ?? 'Review job'}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {sheet.sheetNumber === undefined
              ? `Page ${sheet.pageNumber}`
              : `Sheet ${sheet.sheetNumber}`}
            {sheet.title === undefined ? '' : ` · ${sheet.title}`}
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {sheet.fileName ?? 'Drawing'} · page {sheet.pageNumber} · {sheet.sheetRef}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} label={reviewStatusLabel(job.status)} />
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            {titleCase(sheet.quality)}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            {sheetScaleLabel(sheet.scale)}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            {titleCase(sheet.discipline)}
          </span>
        </div>
      </div>

      {testData ? (
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
          Test data — fixture output. Do not approve as a final customer takeoff.
        </p>
      ) : null}

      {sheet.qualityReasons.length > 0 ? (
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {sheet.qualityReasons.join(' · ')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          {previous === undefined ? null : (
            <Link
              href={`/review/${jobId}/sheets/${encodeURIComponent(previous.id)}`}
              className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              ← Previous sheet
            </Link>
          )}
          {next === undefined ? null : (
            <Link
              href={`/review/${jobId}/sheets/${encodeURIComponent(next.id)}`}
              className="rounded-card border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Next sheet →
            </Link>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {sheet.objectCount} objects · {sheet.measurementCount} measurements ·{' '}
          {sheet.openDiscrepancies} open flags
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <SheetCanvas detail={detail} sheet={sheet} />
        <div className="space-y-4">
          <MeasurementEditor jobId={jobId} measurements={detail.measurements} />
          <DiscrepancyPanel jobId={jobId} discrepancies={detail.discrepancies} />
        </div>
      </div>
    </div>
  );
}
