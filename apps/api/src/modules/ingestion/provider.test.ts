import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env';
import { getFixtureIntake } from './fixtureProvider';
import { ProcessingProviderUnavailableError, resolveIntakeProvider } from './intakeProvider';

function env(overrides: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3000',
    API_BASE_URL: 'http://localhost:4000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
    STORAGE_BUCKET: 'bucket',
    STORAGE_ACCESS_KEY_ID: 'key',
    STORAGE_SECRET_ACCESS_KEY: 'secret',
    PROCESSING_MODE: 'fixture',
    LOG_LEVEL: 'info',
    ...overrides,
  });
}

const productionEnv = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://app.example.com',
  API_BASE_URL: 'https://api.example.com',
  COOKIE_SECURE: 'true',
  EMAIL_FROM: 'no-reply@example.com',
  EMAIL_SMTP_HOST: 'smtp.example.com',
};

describe('processing provider boundary (M11)', () => {
  it('selects fixture intake outside production and marks it as test data', () => {
    const provider = resolveIntakeProvider(env());
    expect(provider.id).toBe('fixture');
    expect(provider.isTestData).toBe(true);
    const intake = provider.extract('projects/a/file.pdf', 'file.pdf');
    expect(intake.pageCount).toBeGreaterThan(0);
  });

  it('refuses fixture processing at production boot', () => {
    expect(() => env({ ...productionEnv, PROCESSING_MODE: 'fixture' })).toThrow(
      /fixture processing is not allowed with NODE_ENV=production/,
    );
  });

  it('never falls back to fixture when provider mode has no adapter', () => {
    const config = env({ ...productionEnv, PROCESSING_MODE: 'provider' });
    expect(() => resolveIntakeProvider(config)).toThrow(ProcessingProviderUnavailableError);
    expect(() => resolveIntakeProvider(config)).toThrow(
      /no processing provider adapter is registered/,
    );
  });

  it('lets dev/test filenames pin the fixture case for browser tests', () => {
    const clean = getFixtureIntake('projects/p/files/random-key', 'fixture-clean.pdf');
    expect(clean.status).toBe('ingested');
    expect(clean.sheets[0]?.scale.status).toBe('detected');

    const missing = getFixtureIntake('projects/p/files/random-key', 'fixture-missing-scale.pdf');
    expect(missing.status).toBe('ingested');
    expect(missing.sheets[0]?.scale.status).toBe('missing');
    expect(missing.missingScalePages).toBe(1);

    const unreadable = getFixtureIntake('projects/p/files/random-key', 'fixture-unreadable.pdf');
    expect(unreadable.status).toBe('rejected');
    expect(unreadable.rejectionReason).toBe('corrupt_or_unreadable');
  });
});
