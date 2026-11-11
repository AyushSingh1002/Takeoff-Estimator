import { describe, expect, it } from 'vitest';
import { computeConcrete } from './concrete';
import { computeDrywall } from './drywall';
import {
  cubicMetersToCubicFeet,
  kilogramsToShortTons,
  sheetAreaM2,
  squareMetersToSquareFeet,
} from './units';
import {
  MM_PER_POINT,
  polygonPerimeterM,
  sheetAreaToRealWorldSquareMeters,
  sheetLengthToRealWorldMillimeters,
} from './geometry';

describe('geometry and unit conversions (M5)', () => {
  it('converts canonical internal units to display units', () => {
    expect(squareMetersToSquareFeet(80)).toBeCloseTo(861.11, 2);
    expect(cubicMetersToCubicFeet(12.6)).toBeCloseTo(16.48, 2);
    expect(kilogramsToShortTons(781.3)).toBeCloseTo(0.8612, 3);
  });

  it('converts sheet geometry using the scale ratio', () => {
    expect(sheetLengthToRealWorldMillimeters(72, 100)).toBeCloseTo(2540, 2);
    expect(sheetAreaToRealWorldSquareMeters(5184, 100)).toBeCloseTo(6.45, 2);
    expect(MM_PER_POINT).toBeCloseTo(0.35278, 5);
  });

  it('computes polygon perimeter', () => {
    expect(
      polygonPerimeterM(
        [
          [0, 0],
          [10, 0],
          [10, 8],
          [0, 8],
        ],
        1,
      ),
    ).toBeCloseTo(12.7, 2);
  });

  it('computes the drywall worked example from the trade conversion rules', () => {
    const result = computeDrywall(
      {
        lengthM: 12,
        heightM: 2.4,
        sides: 2,
        layers: 1,
        openings: [{ widthM: 0.9, heightM: 2.1 }],
      },
      { breakageFactor: 0.1, screwsPerSheet: 32, jointCompoundPerAreaKg: 0.35, tapePerAreaM: 1.2 },
    );
    expect(result.grossAreaM2).toBeCloseTo(57.6, 5);
    expect(result.openingDeductionM2).toBeCloseTo(3.78, 5);
    expect(result.netAreaM2).toBeCloseTo(53.82, 5);
    expect(result.sheetAreaM2).toBe(2.88);
    expect(result.sheetsMinimum).toBe(19);
    expect(result.sheetsWithBreakage).toBe(21);
    expect(result.screws).toBe(672);
    expect(result.jointCompoundKg).toBeCloseTo(18.84, 2);
    expect(result.tapeM).toBeCloseTo(64.58, 2);
  });

  it('computes the concrete worked example from the trade conversion rules', () => {
    const result = computeConcrete({
      slabAreaM2: 80,
      slabThicknessM: 0.15,
      slabPerimeterM: 36,
      wasteFactor: 0.05,
      rebar: { barDiameterMm: 12, spacingMm: 200, layers: 1 },
      mesh: false,
    });
    expect(result.volumeM3).toBeCloseTo(12, 5);
    expect(result.orderVolumeM3).toBeCloseTo(12.6, 5);
    expect(result.rebarMassKg).toBeCloseTo(781.3, 1);
    expect(result.rebarMassTonnes).toBeCloseTo(0.7813, 3);
    expect(result.edgeFormworkM2).toBeCloseTo(5.4, 5);
  });

  it('exposes drywall sheet sizes and their areas', () => {
    expect(sheetAreaM2({ lengthM: 1.2, widthM: 2.4 })).toBe(2.88);
  });
});
