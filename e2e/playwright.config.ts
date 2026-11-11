import { defineConfig } from '@playwright/test';
import { E2E } from './config';

// Escape hatch for machines where Playwright's browser download is blocked:
// point E2E_CHROMIUM_PATH at any Chromium-based executable (Brave, Chrome,
// Edge). CI uses the bundled Chromium.
const executablePath = process.env.E2E_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: E2E.webOrigin,
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: [
    {
      command: 'npx tsx e2e/harness.ts',
      cwd: '..',
      url: `${E2E.apiOrigin}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx next dev -H 127.0.0.1 -p ${E2E.webPort}`,
      cwd: '../apps/web',
      url: `${E2E.webOrigin}/login`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        API_BASE_URL: E2E.apiOrigin,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
