import { z } from 'zod';
import { ACCURACY_TOLERANCE_PCT, computeVariance } from './accuracy.metrics';

export const GOLDEN_SET_SPLITS = ['calibration', 'held_out'] as const;
export const SOURCE_KINDS = ['vector_pdf', 'raster_pdf'] as const;
export const REVIEW_STAGES = ['pre_review', 'post_review'] as const;
export const MIN_HELD_OUT_JOBS_FOR_CLAIM = 100;

const lineSchema = z
  .object({
    trade: z.string().trim().min(1).max(64),
    code: z.string().trim().min(1).max(120),
    unit: z.enum(['m', 'm2', 'm3', 'count']),
    benchmarkQuantity: z.number().finite().positive(),
    deliveredQuantity: z.number().finite().positive(),
  })
  .strict();

const jobSchema = z
  .object({
    jobId: z.string().trim().min(1).max(120),
    sourceKind: z.enum(SOURCE_KINDS),
    split: z.enum(GOLDEN_SET_SPLITS),
    reviewStage: z.enum(REVIEW_STAGES),
    lines: z.array(lineSchema).min(1).max(20),
  })
  .strict();

export const goldenSetManifestSchema = z
  .object({
    dataset: z.string().trim().min(1).max(200),
    rightsConfirmed: z.boolean(),
    jobs: z.array(jobSchema).min(1).max(1000),
  })
  .strict();

export type GoldenSetManifest = z.infer<typeof goldenSetManifestSchema>;
export type GoldenSetJob = z.infer<typeof jobSchema>;

export interface EvaluatedLine {
  trade: string;
  code: string;
  unit: string;
  benchmarkQuantity: number;
  deliveredQuantity: number;
  variancePct: number;
  withinTolerance: boolean;
}

export interface EvaluatedJob {
  jobId: string;
  sourceKind: (typeof SOURCE_KINDS)[number];
  split: (typeof GOLDEN_SET_SPLITS)[number];
  reviewStage: (typeof REVIEW_STAGES)[number];
  passed: boolean;
  lines: EvaluatedLine[];
}

export interface GroupSummary {
  key: string;
  jobs: number;
  passed: number;
  passRate: number;
  lines: number;
  meanVariancePct: number;
}

export interface EvaluationReport {
  dataset: string;
  metricVersion: string;
  tolerancePct: number;
  rightsConfirmed: boolean;
  overall: GroupSummary;
  bySourceKind: GroupSummary[];
  byTrade: GroupSummary[];
  byReviewStage: GroupSummary[];
  varianceBuckets: Array<{ label: string; lines: number }>;
  heldOutJobs: number;
  claimSupported: boolean;
  claimBasis: string;
  warnings: string[];
  jobs: EvaluatedJob[];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function summarise(key: string, jobs: EvaluatedJob[]): GroupSummary {
  const lines = jobs.flatMap((job) => job.lines);
  return {
    key,
    jobs: jobs.length,
    passed: jobs.filter((job) => job.passed).length,
    passRate: round(jobs.filter((job) => job.passed).length / jobs.length),
    lines: lines.length,
    meanVariancePct: mean(lines.map((line) => line.variancePct)),
  };
}

function groupBy(jobs: EvaluatedJob[], keyOf: (job: EvaluatedJob) => string): GroupSummary[] {
  const groups = new Map<string, EvaluatedJob[]>();
  for (const job of jobs) {
    const key = keyOf(job);
    const bucket = groups.get(key) ?? [];
    bucket.push(job);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, grouped]) => summarise(key, grouped))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function bucketVariance(variancePct: number): string {
  if (variancePct < -ACCURACY_TOLERANCE_PCT) {
    return `< -${ACCURACY_TOLERANCE_PCT}%`;
  }
  if (variancePct < -1) {
    return `-${ACCURACY_TOLERANCE_PCT}% to -1%`;
  }
  if (variancePct <= 1) {
    return '-1% to 1%';
  }
  if (variancePct <= ACCURACY_TOLERANCE_PCT) {
    return `1% to ${ACCURACY_TOLERANCE_PCT}%`;
  }
  return `> ${ACCURACY_TOLERANCE_PCT}%`;
}

export function evaluateGoldenSet(manifest: GoldenSetManifest): EvaluationReport {
  const jobs: EvaluatedJob[] = manifest.jobs.map((job) => {
    const lines = job.lines.map((line) => {
      const variance = computeVariance(line.benchmarkQuantity, line.deliveredQuantity);
      return {
        trade: line.trade,
        code: line.code,
        unit: line.unit,
        benchmarkQuantity: line.benchmarkQuantity,
        deliveredQuantity: line.deliveredQuantity,
        variancePct: variance.variancePct,
        withinTolerance: variance.withinTolerance,
      };
    });
    return {
      jobId: job.jobId,
      sourceKind: job.sourceKind,
      split: job.split,
      reviewStage: job.reviewStage,
      passed: lines.every((line) => line.withinTolerance),
      lines,
    };
  });

  const allLines = jobs.flatMap((job) => job.lines);
  const bucketOrder = [
    `< -${ACCURACY_TOLERANCE_PCT}%`,
    `-${ACCURACY_TOLERANCE_PCT}% to -1%`,
    '-1% to 1%',
    `1% to ${ACCURACY_TOLERANCE_PCT}%`,
    `> ${ACCURACY_TOLERANCE_PCT}%`,
  ];
  const bucketCounts = new Map<string, number>(bucketOrder.map((label) => [label, 0]));
  for (const line of allLines) {
    const label = bucketVariance(line.variancePct);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + 1);
  }

  const heldOut = jobs.filter((job) => job.split === 'held_out');
  const heldOutPassRate =
    heldOut.length === 0 ? 0 : heldOut.filter((job) => job.passed).length / heldOut.length;
  const claimSupported =
    manifest.rightsConfirmed &&
    heldOut.length >= MIN_HELD_OUT_JOBS_FOR_CLAIM &&
    heldOutPassRate === 1;
  const claimBasis = claimSupported
    ? `All ${heldOut.length} held-out jobs passed the +/-${ACCURACY_TOLERANCE_PCT}% metric with confirmed rights.`
    : `Claim gate not met: rightsConfirmed=${String(manifest.rightsConfirmed)}, held-out jobs=${heldOut.length} (need ${MIN_HELD_OUT_JOBS_FOR_CLAIM}), held-out pass rate=${round(heldOutPassRate)}.`;

  return {
    dataset: manifest.dataset,
    metricVersion: 'od02.v1',
    tolerancePct: ACCURACY_TOLERANCE_PCT,
    rightsConfirmed: manifest.rightsConfirmed,
    overall: summarise('all', jobs),
    bySourceKind: groupBy(jobs, (job) => job.sourceKind),
    byTrade: groupBy(jobs, (job) => job.lines[0]?.trade ?? 'unknown'),
    byReviewStage: groupBy(jobs, (job) => job.reviewStage),
    varianceBuckets: bucketOrder.map((label) => ({
      label,
      lines: bucketCounts.get(label) ?? 0,
    })),
    heldOutJobs: heldOut.length,
    claimSupported,
    claimBasis,
    warnings: [
      'Results are only valid for the recorded manifest and its confirmed data rights (OD-16).',
      'Product copy must say "target" unless claimSupported is true.',
    ],
    jobs,
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function summaryTable(title: string, rows: GroupSummary[]): string {
  const lines = [
    `### ${title}`,
    '',
    '| Group | Jobs | Passed | Pass rate | Lines | Mean variance |',
    '|-------|-----:|-------:|----------:|------:|--------------:|',
    ...rows.map(
      (row) =>
        `| ${row.key} | ${row.jobs} | ${row.passed} | ${percent(row.passRate)} | ${row.lines} | ${row.meanVariancePct}% |`,
    ),
    '',
  ];
  return lines.join('\n');
}

export function renderMarkdownReport(report: EvaluationReport): string {
  const lines = [
    `# Accuracy evaluation report: ${report.dataset}`,
    '',
    `- Metric: \`${report.metricVersion}\``,
    `- Tolerance: +/-${report.tolerancePct}% per benchmarked line`,
    `- Rights confirmed (OD-16): ${String(report.rightsConfirmed)}`,
    `- Held-out jobs: ${report.heldOutJobs}`,
    `- Overall pass rate: ${percent(report.overall.passRate)} (${report.overall.passed}/${report.overall.jobs})`,
    `- Production accuracy claim supported: **${report.claimSupported ? 'yes' : 'no'}**`,
    `- Claim basis: ${report.claimBasis}`,
    '',
    '> Until `claimSupported` is true, customer-facing copy must say "target" and must not claim +/-3%.',
    '',
    summaryTable('Overall', [report.overall]),
    summaryTable('By source kind', report.bySourceKind),
    summaryTable('By trade', report.byTrade),
    summaryTable('By review stage', report.byReviewStage),
    '### Line variance distribution',
    '',
    '| Bucket | Lines |',
    '|--------|------:|',
    ...report.varianceBuckets.map((bucket) => `| ${bucket.label} | ${bucket.lines} |`),
    '',
    '### Warnings',
    '',
    ...report.warnings.map((warning) => `- ${warning}`),
    '',
  ];
  return lines.join('\n');
}
