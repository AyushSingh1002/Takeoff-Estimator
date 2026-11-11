import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  evaluateGoldenSet,
  goldenSetManifestSchema,
  renderMarkdownReport,
} from '../modules/accuracy/accuracy.evaluation';

function usage(): void {
  process.stderr.write(
    'Usage: npm run accuracy:report -- <manifest.json> [report.md]\n' +
      'The manifest must follow GoldenSetManifest in accuracy.evaluation.ts.\n',
  );
  process.exitCode = 1;
}

function main(): void {
  const manifestPath = process.argv[2];
  if (manifestPath === undefined) {
    usage();
    return;
  }
  const reportPath = process.argv[3] ?? 'accuracy-report.md';
  const raw: unknown = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  const parsed = goldenSetManifestSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(
      `Invalid manifest:\n${parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const report = evaluateGoldenSet(parsed.data);
  const markdown = renderMarkdownReport(report);
  if (reportPath === '-') {
    process.stdout.write(markdown);
  } else {
    writeFileSync(resolve(reportPath), markdown, 'utf8');
    process.stdout.write(`Wrote ${reportPath}\n`);
  }
  if (!report.claimSupported) {
    process.stderr.write(
      'Accuracy claim not supported by this dataset. Product copy must say "target".\n',
    );
  }
}

main();
