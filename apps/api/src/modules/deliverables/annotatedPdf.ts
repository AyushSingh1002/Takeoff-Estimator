import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface AnnotatedMeasurement {
  annotationId?: string | undefined;
  sourceAnnotation?: string | undefined;
  sheetId?: string | undefined;
  value: number;
  unit: string;
  type: string;
}

const TEST_DATA_BANNER = 'TEST DATA - NOT FOR CONSTRUCTION';

export function annotationRef(measurement: AnnotatedMeasurement, index = 0): string {
  return (
    measurement.annotationId ??
    measurement.sourceAnnotation ??
    measurement.sheetId ??
    `measurement-${index + 1}`
  );
}

export async function generateAnnotatedPdf(input: {
  measurements: AnnotatedMeasurement[];
  isTestData: boolean;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  if (input.measurements.length === 0) {
    const page = doc.addPage([595, 842]);
    page.drawText('No measurements available for annotation.', {
      x: 50,
      y: 780,
      size: 12,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }

  input.measurements.forEach((measurement, index) => {
    const page = doc.addPage([595, 842]);
    const ref = annotationRef(measurement, index);
    page.drawRectangle({
      x: 40,
      y: 60,
      width: 515,
      height: 700,
      borderColor: rgb(0.85, 0.42, 0.12),
      borderWidth: 2,
    });
    page.drawText(ref, {
      x: 50,
      y: 780,
      size: 14,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`${measurement.type}: ${measurement.value.toFixed(3)} ${measurement.unit}`, {
      x: 50,
      y: 750,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`Source: ${measurement.sheetId ?? 'unknown sheet'}`, {
      x: 50,
      y: 730,
      size: 10,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    if (input.isTestData) {
      page.drawText(TEST_DATA_BANNER, {
        x: 50,
        y: 40,
        size: 10,
        font: boldFont,
        color: rgb(0.8, 0.1, 0.1),
      });
    }
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
