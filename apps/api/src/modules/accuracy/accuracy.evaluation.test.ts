import { describe, expect, it } from 'vitest';
import {
  MIN_HELD_OUT_JOBS_FOR_CLAIM,
  evaluateGoldenSet,
  goldenSetManifestSchema,
  renderMarkdownReport,
  type GoldenSetManifest,
} from './accuracy.evaluation';

function makeManifest(overrides: Partial<GoldenSetManifest> = {}): GoldenSetManifest {
  return {
    dataset: 'synthetic-evaluation',
    rightsConfirmed: false,
    jobs: [
      {
        jobId: 'job-1',
        sourceKind: 'vector_pdf',
        split: 'held_out',
        reviewStage: 'post_review',
        lines: [
          {
            trade: 'drywall',
            code: 'drywall.board',
            unit: 'm2',
            benchmarkQuantity: 100,
            deliveredQuantity: 102,
          },
        ],
      },
      {
        jobId: 'job-2',
        sourceKind: 'raster_pdf',
        split: 'held_out',
        reviewStage: 'post_review',
        lines: [
          {
            trade: 'concrete',
            code: 'concrete.volume',
            unit: 'm3',
            benchmarkQuantity: 100,
            deliveredQuantity: 97,
          },
        ],
      },
      {
        jobId: 'job-3',
        sourceKind: 'vector_pdf',
        split: 'calibration',
        reviewStage: 'pre_review',
        lines: [
          {
            trade: 'drywall',
            code: 'drywall.board',
            unit: 'm2',
            benchmarkQuantity: 100,
            deliveredQuantity: 110,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('golden-set evaluation (M11)', () => {
  it('computes pass rates, variance buckets and grouped summaries', () => {
    const report = evaluateGoldenSet(makeManifest());
    expect(report.overall.jobs).toBe(3);
    expect(report.overall.passed).toBe(2);
    expect(report.overall.passRate).toBeCloseTo(0.6667, 4);
    expect(report.bySourceKind.map((row) => row.key)).toEqual(['raster_pdf', 'vector_pdf']);
    expect(report.byTrade.map((row) => row.key)).toEqual(['concrete', 'drywall']);
    expect(report.byReviewStage.map((row) => row.key)).toEqual(['post_review', 'pre_review']);
    expect(report.varianceBuckets.reduce((total, bucket) => total + bucket.lines, 0)).toBe(3);
    expect(report.claimSupported).toBe(false);
    expect(renderMarkdownReport(report)).toContain('Production accuracy claim supported: **no**');
  });

  it('only supports a claim with confirmed rights, 100 held-out jobs and a perfect pass rate', () => {
    const jobs = Array.from({ length: MIN_HELD_OUT_JOBS_FOR_CLAIM }, (_, index) => ({
      jobId: `held-out-${index}`,
      sourceKind: 'vector_pdf' as const,
      split: 'held_out' as const,
      reviewStage: 'post_review' as const,
      lines: [
        {
          trade: 'drywall',
          code: 'drywall.board',
          unit: 'm2' as const,
          benchmarkQuantity: 100,
          deliveredQuantity: index % 2 === 0 ? 103 : 97,
        },
      ],
    }));
    const supported = evaluateGoldenSet(
      makeManifest({ dataset: 'supported-synthetic', rightsConfirmed: true, jobs }),
    );
    expect(supported.claimSupported).toBe(true);

    const withFailure = evaluateGoldenSet(
      makeManifest({
        dataset: 'failing-synthetic',
        rightsConfirmed: true,
        jobs: jobs.map((job, index) =>
          index === 0
            ? {
                ...job,
                lines: [
                  {
                    trade: 'drywall',
                    code: 'drywall.board',
                    unit: 'm2' as const,
                    benchmarkQuantity: 100,
                    deliveredQuantity: 104,
                  },
                ],
              }
            : job,
        ),
      }),
    );
    expect(withFailure.claimSupported).toBe(false);

    const noRights = evaluateGoldenSet(
      makeManifest({ dataset: 'no-rights', rightsConfirmed: false, jobs }),
    );
    expect(noRights.claimSupported).toBe(false);

    const tooSmall = evaluateGoldenSet(
      makeManifest({ dataset: 'too-small', rightsConfirmed: true }),
    );
    expect(tooSmall.claimSupported).toBe(false);
  });

  it('rejects malformed manifests and unit-less lines', () => {
    expect(goldenSetManifestSchema.safeParse({}).success).toBe(false);
    expect(
      goldenSetManifestSchema.safeParse({
        dataset: 'bad-units',
        rightsConfirmed: false,
        jobs: [
          {
            jobId: 'job-1',
            sourceKind: 'vector_pdf',
            split: 'held_out',
            reviewStage: 'post_review',
            lines: [
              {
                trade: 'drywall',
                code: 'drywall.board',
                unit: 'ft2',
                benchmarkQuantity: 100,
                deliveredQuantity: 100,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      goldenSetManifestSchema.safeParse({
        dataset: 'zero',
        rightsConfirmed: false,
        jobs: [
          {
            jobId: 'job-1',
            sourceKind: 'vector_pdf',
            split: 'held_out',
            reviewStage: 'post_review',
            lines: [
              {
                trade: 'drywall',
                code: 'drywall.board',
                unit: 'm2',
                benchmarkQuantity: 0,
                deliveredQuantity: 100,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
