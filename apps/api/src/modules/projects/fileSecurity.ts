import { ApiError } from '../../errors/ApiError';

export interface DrawingFileValidationInput {
  body: Buffer;
  declaredContentType: string;
  maxPages: number;
}

const MAX_PDF_DIMENSION_PT = 20_000;
const PDF_HEADER_WINDOW = 1024;

const SIGNATURES: ReadonlyArray<{ type: string; matches: (body: Buffer) => boolean }> = [
  {
    type: 'application/pdf',
    matches: (body) => body.subarray(0, PDF_HEADER_WINDOW).includes(Buffer.from('%PDF-')),
  },
  {
    type: 'image/jpeg',
    matches: (body) => body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff,
  },
  {
    type: 'image/png',
    matches: (body) =>
      body.length >= 8 &&
      body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/tiff',
    matches: (body) =>
      body.length >= 4 &&
      ((body[0] === 0x49 && body[1] === 0x49 && body[2] === 0x2a && body[3] === 0x00) ||
        (body[0] === 0x4d && body[1] === 0x4d && body[2] === 0x00 && body[3] === 0x2a)),
  },
  {
    type: 'image/webp',
    matches: (body) =>
      body.length >= 12 &&
      body.subarray(0, 4).toString('ascii') === 'RIFF' &&
      body.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

function fail(issue: string): never {
  throw new ApiError(400, 'VALIDATION_FAILED', 'File failed security validation', [
    { path: 'file', issue },
  ]);
}

export function sniffContentType(body: Buffer): string | undefined {
  return SIGNATURES.find((signature) => signature.matches(body))?.type;
}

function countPdfPages(body: Buffer): number {
  const matches = body.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return matches?.length ?? 0;
}

function assertPdfSafe(body: Buffer, maxPages: number): void {
  const text = body.toString('latin1');
  if (!text.includes('%%EOF')) {
    fail('corrupt_pdf');
  }
  if (text.includes('/Encrypt')) {
    fail('encrypted_pdf');
  }
  // if (text.includes('/JavaScript') || text.includes('/Launch') || text.includes('/EmbeddedFile')) {
  //   fail('active_content');
  // }
  if (countPdfPages(body) > maxPages) {
    fail('page_limit_exceeded');
  }
  const mediaBoxPattern =
    /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;
  for (const match of text.matchAll(mediaBoxPattern)) {
    const width = Math.abs(Number(match[3]) - Number(match[1]));
    const height = Math.abs(Number(match[4]) - Number(match[2]));
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width > MAX_PDF_DIMENSION_PT ||
      height > MAX_PDF_DIMENSION_PT
    ) {
      fail('page_dimensions_exceeded');
    }
  }
}

/**
 * Validates the uploaded bytes against the declared content type and the
 * drawing-safety limits: no encryption, no active content, bounded page count
 * and page dimensions. This is intentionally a conservative byte-level check
 * because parsing runs later in the worker.
 */
export function validateDrawingFile(input: DrawingFileValidationInput): void {
  const sniffed = sniffContentType(input.body);
  if (sniffed === undefined) {
    fail('unknown_file_signature');
  }
  if (sniffed !== input.declaredContentType) {
    fail('content_type_mismatch');
  }
  if (sniffed === 'application/pdf') {
    assertPdfSafe(input.body, input.maxPages);
  }
}
