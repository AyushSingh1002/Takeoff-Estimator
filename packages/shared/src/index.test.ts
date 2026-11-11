import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from './index';

describe('errorEnvelopeSchema (packages/shared)', () => {
  it('accepts a valid error envelope', () => {
    const parsed = errorEnvelopeSchema.parse({
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_test' },
    });
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('accepts an envelope with optional details', () => {
    const parsed = errorEnvelopeSchema.parse({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: [{ path: 'email', issue: 'invalid_format' }],
        requestId: 'req_test',
      },
    });
    expect(parsed.error.details).toHaveLength(1);
  });

  it('rejects an unknown error code', () => {
    expect(() =>
      errorEnvelopeSchema.parse({ error: { code: 'NOT_A_CODE', message: 'Nope' } }),
    ).toThrow();
  });

  it('rejects a missing message', () => {
    expect(() => errorEnvelopeSchema.parse({ error: { code: 'INTERNAL', message: '' } })).toThrow();
  });
});
