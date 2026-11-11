import ExcelJS from 'exceljs';
import type { HydratedDocument } from 'mongoose';
import type { BoqItemAttrs } from '../pipeline/boqItem.model';
import type { MeasurementAttrs } from '../pipeline/measurement.model';

type BoqItemDoc = HydratedDocument<BoqItemAttrs>;
type MeasurementDoc = HydratedDocument<MeasurementAttrs>;

const TEST_DATA_BANNER = 'TEST DATA - NOT FOR CONSTRUCTION';

export async function generateBoqWorkbook(input: {
  boqItems: BoqItemDoc[];
  measurements: MeasurementDoc[];
  isTestData: boolean;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const boqSheet = workbook.addWorksheet('BOQ');
  boqSheet.columns = [
    { key: 'description', header: 'Description', width: 40 },
    { key: 'trade', header: 'Trade', width: 16 },
    { key: 'quantity', header: 'Quantity', width: 12 },
    { key: 'unit', header: 'Unit', width: 8 },
    { key: 'wasteFactor', header: 'Waste factor', width: 12 },
    { key: 'adjustedQuantity', header: 'Adjusted quantity', width: 16 },
    { key: 'assumptions', header: 'Assumptions', width: 60 },
    { key: 'sourceDrawing', header: 'Source drawing', width: 28 },
    { key: 'sheetRefs', header: 'Sheet ref', width: 16 },
    { key: 'reviewStatus', header: 'Review status', width: 18 },
  ];
  for (const item of input.boqItems) {
    const measurement = input.measurements.find((candidate) =>
      item.measurementIds.includes(candidate._id.toString()),
    );
    boqSheet.addRow({
      description: item.description,
      trade: item.trade,
      quantity: item.quantity,
      unit: item.unit,
      wasteFactor: item.wasteFactor,
      adjustedQuantity: item.adjustedQuantity,
      assumptions: item.assumptions.join('; '),
      sourceDrawing: measurement?.sheetId ?? '',
      sheetRefs: item.sheetRefs.join(', '),
      reviewStatus: item.reviewStatus,
    });
  }
  const assumptionsSheet = workbook.addWorksheet('Assumptions');
  assumptionsSheet.columns = [
    { key: 'code', header: 'BOQ code', width: 20 },
    { key: 'sheetRefs', header: 'Sheet ref', width: 16 },
    { key: 'assumption', header: 'Assumption', width: 100 },
  ];
  for (const item of input.boqItems) {
    for (const assumption of item.assumptions) {
      assumptionsSheet.addRow({
        code: item.code,
        sheetRefs: item.sheetRefs.join(', '),
        assumption,
      });
    }
  }
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { key: 'trade', header: 'Trade', width: 16 },
    { key: 'unit', header: 'Unit', width: 8 },
    { key: 'adjustedQuantity', header: 'Adjusted quantity', width: 16 },
    { key: 'itemCount', header: 'Items', width: 10 },
  ];
  const trades = [...new Set(input.boqItems.map((item) => item.trade))];
  for (const trade of trades) {
    const items = input.boqItems.filter((item) => item.trade === trade);
    summarySheet.addRow({
      trade,
      unit: items[0]?.unit ?? '',
      adjustedQuantity: items.reduce((total, item) => total + item.adjustedQuantity, 0),
      itemCount: items.length,
    });
  }
  if (input.isTestData) {
    for (const sheet of workbook.worksheets) {
      sheet.headerFooter.oddHeader = TEST_DATA_BANNER;
      sheet.headerFooter.oddFooter = TEST_DATA_BANNER;
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as unknown as ArrayBuffer);
}
