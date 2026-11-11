export const CUSTOMER_PROGRESS: Record<string, string> = {
  queued: 'Processing drawings',
  processing: 'Processing drawings',
  awaiting_review: 'Quality review',
  in_review: 'Quality review',
  review_rejected: 'Quality review',
  approved: 'Preparing deliverables',
  compiling: 'Preparing deliverables',
  delivered: 'Ready',
  failed: 'Delayed — we are looking into it',
  cancelled: 'Cancelled',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const FILE_STATUS_LABELS: Record<string, string> = {
  upload_pending: 'Upload pending',
  uploaded: 'Queued for inspection',
  ingesting: 'Inspecting',
  ingested: 'Inspected',
  rejected: 'Rejected',
  failed: 'Failed',
};

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function customerProgressLabel(status: string | undefined): string {
  if (status === undefined) {
    return 'Not submitted';
  }
  return CUSTOMER_PROGRESS[status] ?? status;
}

export function fileStatusLabel(status: string): string {
  return FILE_STATUS_LABELS[status] ?? status;
}

export function formatDate(value: string | undefined): string {
  if (value === undefined) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isFinite(amountMinor)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: string | undefined): string {
  if (value === undefined) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

export const CUSTOMER_PROGRESS_STEPS = [
  'Processing',
  'Quality review',
  'Preparing',
  'Ready',
] as const;

const PROGRESS_STEP_INDEX: Record<string, number> = {
  processing: 0,
  review: 1,
  preparing: 2,
  ready: 3,
};

export function progressStepIndex(stage: string | undefined): number {
  if (stage === undefined) {
    return -1;
  }
  return PROGRESS_STEP_INDEX[stage] ?? -1;
}

export function sheetScaleLabel(scale: { status: string; label?: string }): string {
  if (scale.label !== undefined && scale.label.length > 0) {
    return scale.label;
  }
  switch (scale.status) {
    case 'user_provided':
      return 'Set by you';
    case 'missing':
      return 'Scale missing';
    case 'conflicting':
      return 'Scale conflict';
    case 'calibrated':
      return 'Calibrated';
    case 'detected':
      return 'Detected';
    default:
      return scale.status;
  }
}

export function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

export function deliverableLabel(type: string): string {
  switch (type) {
    case 'boq_xlsx':
      return 'Excel bill of quantities';
    case 'annotated_pdf':
      return 'Annotated drawing PDF';
    default:
      return type;
  }
}

export function isProcessingStatus(status: string): boolean {
  return status === 'uploaded' || status === 'ingesting' || status === 'upload_pending';
}

export function isJobActive(status: string | undefined): boolean {
  return (
    status === 'queued' ||
    status === 'processing' ||
    status === 'awaiting_review' ||
    status === 'in_review' ||
    status === 'approved' ||
    status === 'compiling'
  );
}

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing',
  awaiting_review: 'Awaiting review',
  in_review: 'In review',
  review_rejected: 'Rejected — returns to admin',
  approved: 'Approved',
  compiling: 'Compiling deliverables',
  delivered: 'Delivered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function reviewStatusLabel(status: string): string {
  return REVIEW_STATUS_LABELS[status] ?? titleCase(status);
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(Math.abs(milliseconds) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export type SlaTone = 'overdue' | 'due_soon' | 'on_track' | 'unknown';

export interface SlaCountdown {
  label: string;
  tone: SlaTone;
}

export function slaCountdown(
  deadlineAt: string | undefined,
  nowMs: number = Date.now(),
): SlaCountdown {
  if (deadlineAt === undefined) {
    return { label: 'No deadline', tone: 'unknown' };
  }
  const deadline = new Date(deadlineAt).getTime();
  if (Number.isNaN(deadline)) {
    return { label: 'No deadline', tone: 'unknown' };
  }
  const remaining = deadline - nowMs;
  if (remaining <= 0) {
    return { label: `Overdue by ${formatDuration(remaining)}`, tone: 'overdue' };
  }
  if (remaining <= 4 * 60 * 60 * 1000) {
    return { label: `${formatDuration(remaining)} remaining`, tone: 'due_soon' };
  }
  return { label: `${formatDuration(remaining)} remaining`, tone: 'on_track' };
}

export const SLA_STATUS_LABELS: Record<string, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  breached: 'Breached',
  met: 'Met',
};

export function slaStatusLabel(status: string | undefined): string {
  if (status === undefined) {
    return '—';
  }
  return SLA_STATUS_LABELS[status] ?? titleCase(status);
}

export const ROLE_LABELS: Record<string, string> = {
  customer: 'Customer',
  reviewer: 'Reviewer',
  admin: 'Administrator',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? titleCase(role);
}

export const PRICING_PLAN_LABELS: Record<string, string> = {
  per_takeoff: 'Per takeoff',
  unlimited: 'Unlimited',
  express_addon: 'Express add-on',
  free_trial: 'Free trial',
};

export function pricingPlanLabel(code: string): string {
  return PRICING_PLAN_LABELS[code] ?? titleCase(code);
}

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  upheld: 'Upheld',
  rejected: 'Rejected',
  retakeoff_in_progress: 'Re-takeoff in progress',
  resolved: 'Resolved',
};

export function claimStatusLabel(status: string): string {
  return CLAIM_STATUS_LABELS[status] ?? titleCase(status);
}

export const BENCHMARK_SOURCE_LABELS: Record<string, string> = {
  golden_set: 'Golden set',
  licensed_estimator: 'Licensed estimator',
  customer_challenge: 'Customer challenge',
};

export function benchmarkSourceLabel(source: string): string {
  return BENCHMARK_SOURCE_LABELS[source] ?? titleCase(source);
}

export function rulePackStatusLabel(status: string): string {
  return titleCase(status);
}

function parameterLabel(key: string): string {
  const words = key.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function rulePackParameterSummary(parameters: Record<string, number>): string {
  const entries = Object.entries(parameters);
  if (entries.length === 0) {
    return '—';
  }
  return entries
    .map(([key, value]) => `${parameterLabel(key)} ${formatQuantity(value)}`)
    .join(' · ');
}
