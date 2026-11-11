export const CANONICAL_UNITS = ['m', 'm2', 'm3', 'kg', 'count'] as const;
export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

export const SQUARE_FEET_PER_SQUARE_METER = 10.7639;
export const CUBIC_FEET_PER_CUBIC_METER = 1.30795;
export const SHORT_TONS_PER_KILOGRAM = 907.185;

export function squareMetersToSquareFeet(squareMeters: number): number {
  return squareMeters * SQUARE_FEET_PER_SQUARE_METER;
}

export function cubicMetersToCubicFeet(cubicMeters: number): number {
  return cubicMeters * CUBIC_FEET_PER_CUBIC_METER;
}

export function kilogramsToShortTons(kilograms: number): number {
  return kilograms / SHORT_TONS_PER_KILOGRAM;
}

export interface DrywallSheetSize {
  lengthM: number;
  widthM: number;
}

export const DRYWALL_SHEET_SIZES: readonly DrywallSheetSize[] = [
  { lengthM: 1.2, widthM: 2.4 },
  { lengthM: 1.2, widthM: 3.0 },
];

export function sheetAreaM2(sheet: DrywallSheetSize): number {
  return sheet.lengthM * sheet.widthM;
}
