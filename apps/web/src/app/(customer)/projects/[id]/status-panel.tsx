import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  CUSTOMER_PROGRESS_STEPS,
  formatDateTime,
  isJobActive,
  progressStepIndex,
} from '../../../../lib/format';
import type { JobProgress, TakeoffJob } from '../../../../lib/types';

const SLA_LABELS: Record<string, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  breached: 'Past target',
  met: 'Met',
};

function StepCircle({
  index,
  currentIndex,
}: {
  index: number;
  currentIndex: number;
}): ReactElement {
  const done = currentIndex >= 0 && index < currentIndex;
  const current = index === currentIndex;
  const classes = done
    ? 'bg-green-600 text-white'
    : current
      ? 'bg-brand-600 text-white'
      : 'bg-slate-100 text-slate-500';
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${classes}`}
    >
      {done ? '✓' : index + 1}
    </span>
  );
}

export function StatusPanel({
  projectId,
  job,
  progress,
  targetDeadlineAt,
}: {
  projectId: string;
  job: TakeoffJob;
  progress: JobProgress;
  targetDeadlineAt?: string | undefined;
}): ReactElement {
  const currentIndex = progressStepIndex(progress.stage);
  const delayed = progress.stage === 'delayed';
  const cancelled = progress.stage === 'cancelled';
  const ready = progress.stage === 'ready';

  return (
    <section
      aria-labelledby="status-heading"
      className="rounded-card border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="status-heading" className="text-lg font-semibold tracking-tight">
            Progress
          </h2>
          <p aria-live="polite" className="mt-1 text-sm text-slate-600">
            {progress.label}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>
            {job.sla.submittedAt === undefined
              ? null
              : `Submitted ${formatDateTime(job.sla.submittedAt)}`}
          </p>
          <p className="mt-0.5">
            {ready
              ? `Delivered ${formatDateTime(job.sla.deliveredAt)}`
              : `Target ${formatDateTime(targetDeadlineAt)}`}
          </p>
          {job.sla.status === undefined ? null : (
            <p className="mt-0.5 font-medium text-slate-700">
              {SLA_LABELS[job.sla.status] ?? job.sla.status}
            </p>
          )}
        </div>
      </div>

      {job.isTestData === true ? (
        <p className="mt-4 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          Test data — this project was processed by the fixture provider, not the production
          pipeline. Do not use it as a final takeoff.
        </p>
      ) : null}

      {delayed || cancelled ? (
        <p
          role="alert"
          className={`mt-4 rounded-card px-3 py-2 text-sm font-medium ${
            cancelled ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-800'
          }`}
        >
          {progress.label}
        </p>
      ) : (
        <ol className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CUSTOMER_PROGRESS_STEPS.map((step, index) => {
            const done = currentIndex >= 0 && index < currentIndex;
            const current = index === currentIndex;
            return (
              <li key={step} className="flex items-start gap-2">
                <StepCircle index={index} currentIndex={currentIndex} />
                <div>
                  <p
                    className={`text-sm font-medium ${
                      done || current ? 'text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {step}
                  </p>
                  {current ? <p className="text-xs text-brand-700">In progress</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {ready ? (
          <Link
            href={`/projects/${projectId}/boq`}
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View bill of quantities
          </Link>
        ) : isJobActive(job.status) ? (
          <p className="text-xs text-slate-500">
            This page refreshes automatically while the takeoff is being processed.
          </p>
        ) : null}
      </div>
    </section>
  );
}
