import { z } from 'zod';
import {
  ACCURACY_BENCHMARK_SOURCES,
  type AccuracyBenchmarkSource,
} from './accuracyBenchmark.model';
import { ACCURACY_CLAIM_STATUSES } from './accuracyClaim.model';

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a valid identifier');

const storageKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !value.includes('..'), 'Storage keys must not traverse paths');

export const fileAccuracyClaimBodySchema = z
  .object({
    jobId: objectIdSchema,
    reason: z.string().trim().min(1).max(2000),
    evidence: z.array(storageKeySchema).max(20).default([]),
  })
  .strict();

export const accuracyClaimListQuerySchema = z
  .object({
    status: z.enum(ACCURACY_CLAIM_STATUSES).optional(),
    jobId: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const benchmarkLineBodySchema = z
  .object({
    trade: z.string().trim().min(1).max(64),
    code: z.string().trim().min(1).max(120),
    benchmarkQuantity: z.number().finite().positive(),
    unit: z.enum(['m', 'm2', 'm3', 'count']),
  })
  .strict();

export const recordBenchmarkBodySchema = z
  .object({
    source: z.enum(ACCURACY_BENCHMARK_SOURCES).default('customer_challenge'),
    metricVersion: z.string().trim().min(1).max(64).optional(),
    lines: z.array(benchmarkLineBodySchema).min(1).max(50),
  })
  .strict();

export const claimDecisionBodySchema = z
  .object({
    decision: z.enum(['uphold', 'reject']),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();

export type FileAccuracyClaimInput = z.infer<typeof fileAccuracyClaimBodySchema>;
export type AccuracyClaimListQuery = z.infer<typeof accuracyClaimListQuerySchema>;
export type RecordBenchmarkInput = z.infer<typeof recordBenchmarkBodySchema>;
export type ClaimDecisionInput = z.infer<typeof claimDecisionBodySchema>;
export type BenchmarkSource = AccuracyBenchmarkSource;
