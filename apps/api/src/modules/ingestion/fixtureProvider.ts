import { createHash } from 'crypto';
import type { SheetScale, SheetSourceKind } from './drawingSheet.model';

export const INTAKE_REPORT_STATUSES = ['ingested', 'rejected'] as const;
export type IntakeReportStatus = (typeof INTAKE_REPORT_STATUSES)[number];

export type FixtureCase = 'clean' | 'missing-scale' | 'unreadable';

export interface FixtureSheet {
  pageNumber: number;
  sourceKind: SheetSourceKind;
  classification: string;
  classificationConfidence: number;
  widthPt?: number;
  heightPt?: number;
  scale: SheetScale;
}

export interface FixtureIntake {
  status: IntakeReportStatus;
  rejectionReason?: string;
  pageCount: number;
  sourceKind: SheetSourceKind;
  sheets: FixtureSheet[];
  unreadablePages: number;
  missingScalePages: number;
  intakeReport: {
    status: IntakeReportStatus;
    rejectionReason?: string;
    pageCount: number;
    sourceKind: SheetSourceKind;
    unreadablePages: number;
    missingScalePages: number;
    sheets: Array<{
      pageNumber: number;
      classification: string;
      classificationConfidence: number;
      scale: SheetScale;
    }>;
  };
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function resolveFixtureCase(hash: string): FixtureCase {
  if (hash.endsWith('c')) {
    return 'unreadable';
  }
  const lastCharCode = hash.charCodeAt(hash.length - 1);
  if (lastCharCode % 3 === 1) {
    return 'missing-scale';
  }
  return 'clean';
}

/**
 * Storage keys are random UUIDs, so browser-driven tests cannot predict which
 * case the hash will select. A filename that names the case explicitly makes
 * the fixture deterministic for dev/test and E2E suites. This only exists in
 * the fixture provider, which is rejected in production.
 */
export function namedFixtureCase(originalName: string): FixtureCase | undefined {
  const name = originalName.toLowerCase();
  if (name.includes('fixture-missing-scale')) {
    return 'missing-scale';
  }
  if (name.includes('fixture-unreadable')) {
    return 'unreadable';
  }
  if (name.includes('fixture-clean')) {
    return 'clean';
  }
  return undefined;
}

export function getFixtureIntake(storageKey: string, originalName: string): FixtureIntake {
  const hash = hashValue(`${storageKey}:${originalName}`);
  const seed = Number.parseInt(hash.slice(0, 8), 16);
  const sourceKind: SheetSourceKind = seed % 2 === 0 ? 'vector_pdf' : 'raster_pdf';
  const pageCount = 1 + (seed % 4);
  const fixtureCase = namedFixtureCase(originalName) ?? resolveFixtureCase(hash);

  if (fixtureCase === 'unreadable') {
    return {
      status: 'rejected',
      rejectionReason: 'corrupt_or_unreadable',
      pageCount,
      sourceKind,
      sheets: [],
      unreadablePages: 0,
      missingScalePages: 0,
      intakeReport: {
        status: 'rejected',
        rejectionReason: 'corrupt_or_unreadable',
        pageCount,
        sourceKind,
        unreadablePages: 0,
        missingScalePages: 0,
        sheets: [],
      },
    };
  }

  const sheets = Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    sourceKind,
    classification: index === 0 ? 'floor_plan' : 'section',
    classificationConfidence: 0.8,
    widthPt: 841,
    heightPt: 1189,
    scale: {
      status:
        fixtureCase === 'missing-scale' && index === 0
          ? ('missing' as const)
          : ('detected' as const),
      label: fixtureCase === 'missing-scale' && index === 0 ? undefined : '1:100',
      ratio: fixtureCase === 'missing-scale' && index === 0 ? undefined : 0.01,
      source: fixtureCase === 'missing-scale' && index === 0 ? undefined : 'fixture-calibration',
      confidence: fixtureCase === 'missing-scale' && index === 0 ? undefined : 0.9,
    },
  }));

  const missingScalePages = sheets.filter((sheet) => sheet.scale.status === 'missing').length;

  return {
    status: 'ingested',
    pageCount,
    sourceKind,
    sheets,
    unreadablePages: 0,
    missingScalePages,
    intakeReport: {
      status: 'ingested',
      pageCount,
      sourceKind,
      unreadablePages: 0,
      missingScalePages,
      sheets: sheets.map((sheet) => ({
        pageNumber: sheet.pageNumber,
        classification: sheet.classification,
        classificationConfidence: sheet.classificationConfidence,
        scale: sheet.scale,
      })),
    },
  };
}
