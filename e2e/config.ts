/**
 * Ports and fixture credentials shared by the Playwright config, the E2E
 * server harness and the specs. Keeping them in one place avoids the config
 * and the harness drifting apart.
 */
export const E2E = {
  apiPort: 4100,
  webPort: 3100,
  storagePort: 9100,
  apiOrigin: 'http://127.0.0.1:4100',
  webOrigin: 'http://127.0.0.1:3100',
  storageOrigin: 'http://127.0.0.1:9100',
  password: 'E2ePassword!2026',
  reviewerEmail: 'reviewer@e2e.test',
  reviewerName: 'E2E Reviewer',
  adminEmail: 'admin@e2e.test',
  adminName: 'E2E Admin',
} as const;
