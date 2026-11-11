import type { ReactElement } from 'react';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  success: 'bg-green-50 text-green-800 ring-green-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-100',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const ICONS: Record<Tone, string> = {
  success: '✓',
  warning: '!',
  danger: '×',
  info: 'i',
  neutral: '•',
};

function toneForStatus(status: string): Tone {
  if (['delivered', 'ingested', 'Ready', 'active'].includes(status)) {
    return 'success';
  }
  if (['rejected', 'failed', 'cancelled', 'Delayed'].includes(status)) {
    return 'danger';
  }
  if (['draft', 'upload_pending', 'uploaded'].includes(status)) {
    return 'neutral';
  }
  if (['ingesting', 'queued', 'processing', 'awaiting_review', 'in_review'].includes(status)) {
    return 'info';
  }
  return 'warning';
}

export function StatusBadge({ status, label }: { status: string; label: string }): ReactElement {
  const tone = toneForStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      <span aria-hidden="true" className="font-mono text-[0.65rem]">
        {ICONS[tone]}
      </span>
      {label}
    </span>
  );
}
