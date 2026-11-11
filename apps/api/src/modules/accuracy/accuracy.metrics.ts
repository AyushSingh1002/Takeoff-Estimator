/**
 * Accuracy metric constants from OD-02 / TESTING_STRATEGY §6.
 *
 * The metric compares the primary quantity per trade (delivered vs an
 * independent benchmark). A job passes only when every benchmarked line is
 * within +/-3%. These numbers are metric definitions, not commercial claims:
 * customer-facing copy says "target" until the golden-set results support it.
 */
export const ACCURACY_METRIC_VERSION = 'od02.v1';
export const ACCURACY_TOLERANCE_PCT = 3;
export const ACCURACY_CLAIM_WINDOW_DAYS = 30;

export interface VarianceResult {
  variancePct: number;
  withinTolerance: boolean;
}

export function computeVariance(
  benchmarkQuantity: number,
  deliveredQuantity: number,
): VarianceResult {
  const variance = ((deliveredQuantity - benchmarkQuantity) / benchmarkQuantity) * 100;
  const variancePct = Number(variance.toFixed(4));
  return {
    variancePct,
    withinTolerance: Math.abs(variancePct) <= ACCURACY_TOLERANCE_PCT,
  };
}
