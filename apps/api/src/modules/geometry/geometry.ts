export const MM_PER_POINT = 25.4 / 72;

export function sheetLengthToRealWorldMillimeters(pts: number, scaleRatio: number): number {
  return pts * MM_PER_POINT * scaleRatio;
}

export function sheetAreaToRealWorldSquareMeters(ptsArea: number, scaleRatio: number): number {
  const mmSquared = MM_PER_POINT * MM_PER_POINT * scaleRatio * scaleRatio;
  return (ptsArea * mmSquared) / 1_000_000;
}

export function polygonAreaM2(
  polygon: ReadonlyArray<ReadonlyArray<number>>,
  scaleRatio: number,
): number {
  const points = polygon.length;
  let doubledArea = 0;
  for (let index = 0; index < points; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % points];
    if (current === undefined || next === undefined) {
      continue;
    }
    doubledArea += (current[0] ?? 0) * (next[1] ?? 0) - (next[0] ?? 0) * (current[1] ?? 0);
  }
  const areaM2 =
    (Math.abs(doubledArea) / 2) * MM_PER_POINT * MM_PER_POINT * scaleRatio * scaleRatio;
  return areaM2 / 1_000_000;
}

export function polygonPerimeterM(
  polygon: ReadonlyArray<ReadonlyArray<number>>,
  scaleRatio: number,
): number {
  const points = polygon.length;
  let perimeterPts = 0;
  for (let index = 0; index < points; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % points];
    if (current === undefined || next === undefined) {
      continue;
    }
    const dx = (next[0] ?? 0) - (current[0] ?? 0);
    const dy = (next[1] ?? 0) - (current[1] ?? 0);
    perimeterPts += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeterPts * MM_PER_POINT * scaleRatio;
}
