import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  test: {
    include: ['packages/shared/**/*.test.ts', 'apps/api/**/*.test.ts', 'apps/web/**/*.test.ts'],
    hookTimeout: 120000,
    // Each API suite starts its own mongodb-memory-server. Running files in
    // parallel can exhaust ports/memory on CI and produce flaky workers.
    fileParallelism: false,
  },
});
