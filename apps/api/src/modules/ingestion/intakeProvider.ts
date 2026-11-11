import { loadEnv, type Env } from '../../config/env';
import { getFixtureIntake, type FixtureIntake } from './fixtureProvider';

/**
 * Boundary between the pipeline and whatever produces intake/measurement
 * proposals. Per AI_PROVIDER_INTEGRATION §1-2 the pipeline must never depend on
 * a concrete provider; fixture output may only be selected explicitly outside
 * production (AI_PROVIDER_INTEGRATION §5).
 */
export type ProcessingIntake = FixtureIntake;

export interface IntakeProvider {
  readonly id: string;
  readonly isTestData: boolean;
  extract(storageKey: string, originalName: string): ProcessingIntake;
}

export class ProcessingProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessingProviderUnavailableError';
  }
}

const fixtureIntakeProvider: IntakeProvider = {
  id: 'fixture',
  isTestData: true,
  extract: getFixtureIntake,
};

/**
 * Selects the intake provider from configuration. There is deliberately no
 * fallback: `PROCESSING_MODE=provider` with no registered adapter fails loudly
 * instead of silently producing fixture quantities.
 */
export function resolveIntakeProvider(env: Env = loadEnv()): IntakeProvider {
  if (env.PROCESSING_MODE === 'fixture') {
    if (env.NODE_ENV === 'production') {
      throw new ProcessingProviderUnavailableError(
        'Fixture processing is not allowed when NODE_ENV=production',
      );
    }
    return fixtureIntakeProvider;
  }
  throw new ProcessingProviderUnavailableError(
    `PROCESSING_MODE=provider but no processing provider adapter is registered ` +
      `(OCR_PROVIDER=${env.OCR_PROVIDER ?? 'unset'}, VISION_PROVIDER=${env.VISION_PROVIDER ?? 'unset'}). ` +
      'Refusing to process drawings with fixture data.',
  );
}

export function getIntakeProvider(): IntakeProvider {
  return resolveIntakeProvider();
}
