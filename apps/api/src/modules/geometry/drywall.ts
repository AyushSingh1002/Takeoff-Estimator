export interface DrywallOpening {
  widthM: number;
  heightM: number;
}

export interface DrywallWallRun {
  lengthM: number;
  heightM: number;
  sides: number;
  layers: number;
  openings?: DrywallOpening[];
}

export interface DrywallParams {
  sheetAreaM2?: number;
  breakageFactor?: number;
  screwsPerSheet?: number;
  jointCompoundPerAreaKg?: number;
  tapePerAreaM?: number;
  deductionThresholdM2?: number;
}

export interface DrywallResult {
  grossAreaM2: number;
  openingDeductionM2: number;
  netAreaM2: number;
  sheetAreaM2: number;
  sheetsMinimum: number;
  sheetsWithBreakage: number;
  screws: number;
  jointCompoundKg: number;
  tapeM: number;
}

export const DRYWALL_ENGINE_VERSION = '0.1.0';

export function computeDrywall(run: DrywallWallRun, params: DrywallParams = {}): DrywallResult {
  const sheetAreaM2 = params.sheetAreaM2 ?? 2.88;
  const breakageFactor = params.breakageFactor ?? 0.05;
  const screwsPerSheet = params.screwsPerSheet ?? 32;
  const jointCompoundPerAreaKg = params.jointCompoundPerAreaKg ?? 0.35;
  const tapePerAreaM = params.tapePerAreaM ?? 1.2;
  const deductionThresholdM2 = params.deductionThresholdM2 ?? 0;

  const sides = Math.max(1, run.sides);
  const layers = Math.max(1, run.layers);
  const grossAreaM2 = run.lengthM * run.heightM * sides * layers;
  const openingDeductionM2 = (run.openings ?? []).reduce((sum, opening) => {
    const openingArea = opening.widthM * opening.heightM;
    return sum + (openingArea >= deductionThresholdM2 ? openingArea : 0) * sides * layers;
  }, 0);
  const netAreaM2 = grossAreaM2 - openingDeductionM2;

  const sheetsMinimum = Math.ceil(netAreaM2 / sheetAreaM2);
  const sheetsWithBreakage = Math.ceil(sheetsMinimum * (1 + breakageFactor));

  return {
    grossAreaM2,
    openingDeductionM2,
    netAreaM2,
    sheetAreaM2,
    sheetsMinimum,
    sheetsWithBreakage,
    screws: sheetsWithBreakage * screwsPerSheet,
    jointCompoundKg: netAreaM2 * jointCompoundPerAreaKg,
    tapeM: netAreaM2 * tapePerAreaM,
  };
}
