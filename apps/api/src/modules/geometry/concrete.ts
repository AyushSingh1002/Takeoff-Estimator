export interface ConcreteRebarSpec {
  barDiameterMm: number;
  spacingMm: number;
  layers: number;
}

export interface ConcreteInput {
  slabAreaM2: number;
  slabThicknessM: number;
  slabPerimeterM?: number;
  wasteFactor?: number;
  rebar?: ConcreteRebarSpec | null;
  mesh?: boolean;
  meshLapFactor?: number;
  columnCount?: number;
  columnSectionAreaM2?: number;
  columnHeightM?: number;
}

export interface ConcreteResult {
  volumeM3: number;
  orderVolumeM3: number;
  rebarMassKg: number;
  rebarMassTonnes: number;
  meshAreaM2: number;
  edgeFormworkM2: number;
  columnVolumeM3: number;
}

export const CONCRETE_ENGINE_VERSION = '0.1.0';

export function computeConcrete(input: ConcreteInput): ConcreteResult {
  const wasteFactor = input.wasteFactor ?? 0.05;
  const lapFactor = 0.1;
  const meshLapFactor = 0.1;

  const volumeM3 = input.slabAreaM2 * input.slabThicknessM;
  const orderVolumeM3 = volumeM3 * (1 + wasteFactor);

  let rebarMassKg = 0;
  let rebarMassTonnes = 0;
  if (input.rebar !== undefined && input.rebar !== null) {
    const barLengthM =
      input.slabAreaM2 * (input.rebar.layers * (2 / (input.rebar.spacingMm / 1000)));
    const barMassPerM = (input.rebar.barDiameterMm * input.rebar.barDiameterMm) / 162.2;
    rebarMassKg = barLengthM * barMassPerM;
    rebarMassKg = rebarMassKg * (1 + lapFactor);
    rebarMassTonnes = rebarMassKg / 1000;
  }

  const meshAreaM2 = input.mesh === true ? input.slabAreaM2 * (1 + meshLapFactor) : 0;
  const edgeFormworkM2 = (input.slabPerimeterM ?? 0) * input.slabThicknessM;

  const columnVolumeM3 =
    input.columnCount === undefined ||
    input.columnSectionAreaM2 === undefined ||
    input.columnHeightM === undefined
      ? 0
      : input.columnCount * input.columnSectionAreaM2 * (input.columnHeightM ?? 0);

  return {
    volumeM3,
    orderVolumeM3,
    rebarMassKg,
    rebarMassTonnes,
    meshAreaM2,
    edgeFormworkM2,
    columnVolumeM3,
  };
}
