import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { AutoRefresh } from '../../../../components/auto-refresh';
import { DeliverablesPanel } from '../../../../components/deliverables-panel';
import { StatusBadge } from '../../../../components/ui/status-badge';
import {
  fileStatusLabel,
  formatBytes,
  formatDate,
  isJobActive,
  isProcessingStatus,
  projectStatusLabel,
} from '../../../../lib/format';
import { ServerApiError, serverApi } from '../../../../lib/server-api';
import type {
  Deliverable,
  DrawingFile,
  DrawingSheet,
  JobProgress,
  Project,
  ProjectQuote,
  TakeoffJob,
} from '../../../../lib/types';
import { DeleteFileButton } from './delete-file-button';
import { FileUploader } from './file-uploader';
import { IntakeReview } from './intake-review';
import { QuotePanel } from './quote-panel';
import { StatusPanel } from './status-panel';

export const metadata: Metadata = { title: 'Project' };

interface StatusResponse {
  job: TakeoffJob;
  progress: JobProgress;
  targetDeadlineAt?: string;
}

interface Loaded<T> {
  ok: true;
  data: T;
}

interface LoadFailed {
  ok: false;
  message: string;
}

type LoadResult<T> = Loaded<T> | LoadFailed;

async function load<T>(path: string): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await serverApi<T>(path) };
  } catch (error: unknown) {
    if (error instanceof ServerApiError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

async function loadProject(id: string): Promise<Project> {
  try {
    return (await serverApi<{ project: Project }>(`/projects/${id}`)).project;
  } catch (error: unknown) {
    if (error instanceof ServerApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const project = await loadProject(id);
  const draft = project.status === 'draft';

  const [filesResult, sheetsResult, quoteResult, statusResult, deliverablesResult] =
    await Promise.all([
      serverApi<{ files: DrawingFile[] }>(`/projects/${id}/files`),
      load<{ sheets: DrawingSheet[] }>(`/projects/${id}/sheets`),
      draft ? load<{ quote: ProjectQuote }>(`/projects/${id}/quote`) : Promise.resolve(undefined),
      draft ? Promise.resolve(undefined) : load<StatusResponse>(`/projects/${id}/status`),
      draft
        ? Promise.resolve(undefined)
        : load<{ deliverables: Deliverable[] }>(`/projects/${id}/deliverables`),
    ]);

  const files = filesResult.files;
  const sheets = sheetsResult.ok ? sheetsResult.data.sheets : [];
  const processingFiles = files.some((file) => isProcessingStatus(file.status));
  const job = statusResult?.ok === true ? statusResult.data.job : undefined;
  const jobActive = isJobActive(job?.status);
  const ready = job?.status === 'delivered';

  const includedSheets = sheets.filter((sheet) => sheet.inclusion !== 'excluded');
  const unreadable = includedSheets.filter((sheet) => sheet.quality === 'unreadable');
  const unscaled = includedSheets.filter(
    (sheet) => sheet.scale.status === 'missing' || sheet.scale.status === 'conflicting',
  );
  const blockers: string[] = [];
  if (processingFiles) {
    blockers.push('Wait for drawing inspection to finish.');
  }
  if (sheets.length > 0 && includedSheets.length === 0) {
    blockers.push('Include at least one sheet.');
  }
  if (unreadable.length > 0) {
    blockers.push(`Exclude or replace ${unreadable.length} unreadable sheet(s).`);
  }
  if (unscaled.length > 0) {
    blockers.push(`Set a scale or exclude ${unscaled.length} sheet(s).`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-600 hover:text-brand-700">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {project.reference} · {project.regionPackCode} · created{' '}
              {formatDate(project.createdAt)}
            </p>
          </div>
          <StatusBadge status={project.status} label={projectStatusLabel(project.status)} />
        </div>
      </div>

      <AutoRefresh enabled={processingFiles || jobActive} />

      {draft ? (
        <>
          {sheetsResult.ok ? null : (
            <p role="alert" className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Could not load the sheet list: {sheetsResult.message}
            </p>
          )}

          {sheets.length > 0 ? (
            <IntakeReview projectId={id} sheets={sheets} />
          ) : (
            <div className="rounded-card border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="text-sm font-semibold text-slate-900">No inspected sheets yet</h2>
              <p className="mt-1 text-sm text-slate-600">
                Upload the drawing set to start the intake inspection.
              </p>
            </div>
          )}

          {quoteResult === undefined ? null : quoteResult.ok ? (
            <QuotePanel projectId={id} quote={quoteResult.data.quote} blockers={blockers} />
          ) : (
            <p role="alert" className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The price is unavailable right now: {quoteResult.message}
            </p>
          )}

          <FileUploader projectId={id} />

          {processingFiles ? (
            <p className="text-xs text-slate-500">
              Inspection can take a moment. This page refreshes automatically.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {statusResult?.ok === true ? (
            <StatusPanel
              projectId={id}
              job={statusResult.data.job}
              progress={statusResult.data.progress}
              targetDeadlineAt={statusResult.data.targetDeadlineAt}
            />
          ) : (
            <p role="alert" className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Could not load progress:{' '}
              {statusResult?.ok === false ? statusResult.message : 'Unknown'}
            </p>
          )}

          {deliverablesResult?.ok === true ? (
            <DeliverablesPanel
              deliverables={deliverablesResult.data.deliverables}
              projectReference={project.reference}
              emptyMessage={
                ready
                  ? 'Deliverables are being prepared. Refresh in a moment.'
                  : 'Deliverables appear here once quality review and compilation are complete.'
              }
            />
          ) : null}

          {statusResult?.ok === true && !ready ? (
            <p className="text-xs text-slate-500">
              You can leave this page. Processing continues in the background.
            </p>
          ) : null}
        </>
      )}

      <section
        aria-labelledby="files-heading"
        className="rounded-card border border-slate-200 bg-white"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="files-heading" className="text-sm font-semibold text-slate-900">
            Files
          </h2>
          <span className="text-xs text-slate-500">
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {files.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-600">No drawings uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{file.originalName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatBytes(file.sizeBytes)}
                    {file.pageCount === undefined ? '' : ` · ${file.pageCount} pages`}
                    {file.intakeReport === undefined
                      ? ''
                      : ` · ${file.intakeReport.missingScalePages} scale issue(s), ${file.intakeReport.unreadablePages} unreadable page(s)`}
                  </p>
                  {file.rejectionReason === undefined ? null : (
                    <p className="mt-1 text-xs text-red-700">Rejected: {file.rejectionReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={file.status} label={fileStatusLabel(file.status)} />
                  {draft ? (
                    <DeleteFileButton
                      projectId={id}
                      fileId={file.id}
                      fileName={file.originalName}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
