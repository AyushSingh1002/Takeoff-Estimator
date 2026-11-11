import { model, Schema, type Document } from 'mongoose';

export const ACCURACY_BENCHMARK_SOURCES = [
  'golden_set',
  'licensed_estimator',
  'customer_challenge',
] as const;
export type AccuracyBenchmarkSource = (typeof ACCURACY_BENCHMARK_SOURCES)[number];

export interface AccuracyBenchmarkLine {
  trade: string;
  code: string;
  benchmarkQuantity: number;
  unit: string;
  deliveredQuantity: number;
  variancePct: number;
}

export interface AccuracyBenchmarkAttrs {
  jobId: string;
  source: AccuracyBenchmarkSource;
  benchmarkBy: string;
  lines: AccuracyBenchmarkLine[];
  metricVersion: string;
  withinTolerance: boolean;
}

const BenchmarkLineSchema = new Schema(
  {
    trade: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    benchmarkQuantity: { type: Number, required: true },
    unit: { type: String, required: true, trim: true },
    deliveredQuantity: { type: Number, required: true },
    variancePct: { type: Number, required: true },
  },
  { _id: false },
);

const AccuracyBenchmarkSchema = new Schema<AccuracyBenchmarkAttrs & Document>(
  {
    jobId: { type: String, required: true },
    source: { type: String, enum: ACCURACY_BENCHMARK_SOURCES, required: true },
    benchmarkBy: { type: String, required: true },
    lines: { type: [BenchmarkLineSchema], required: true },
    metricVersion: { type: String, required: true, trim: true },
    withinTolerance: { type: Boolean, required: true },
  },
  { timestamps: true },
);

AccuracyBenchmarkSchema.index({ jobId: 1 });

export const AccuracyBenchmark = model<AccuracyBenchmarkAttrs & Document>(
  'AccuracyBenchmark',
  AccuracyBenchmarkSchema,
);
