import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import {
  InMemoryEmailSender,
  SmtpEmailSender,
  getEmailSender,
  setEmailSenderForTesting,
} from './email';

function env(overrides: Record<string, string | undefined> = {}) {
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

describe('email provider (M11)', () => {
  afterEach(() => {
    setEmailSenderForTesting(null);
  });

  it('records messages with the in-memory sender', async () => {
    const sender = new InMemoryEmailSender();
    await sender.send({ to: 'customer@example.com', subject: 'Hello', text: 'Body' });
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]?.to).toBe('customer@example.com');
    sender.clear();
    expect(sender.messages).toHaveLength(0);
  });

  it('refuses to build an SMTP sender without EMAIL_FROM', () => {
    expect(() => new SmtpEmailSender(env())).toThrow(/EMAIL_FROM is required/);
  });

  it('builds an SMTP sender from configuration', () => {
    const sender = new SmtpEmailSender(
      env({ EMAIL_FROM: 'no-reply@example.com', EMAIL_SMTP_HOST: 'localhost' }),
    );
    expect(sender).toBeInstanceOf(SmtpEmailSender);
  });

  it('uses the override and restores the configured sender', () => {
    const sender = new InMemoryEmailSender();
    setEmailSenderForTesting(sender);
    expect(getEmailSender(env())).toBe(sender);
    setEmailSenderForTesting(null);
    expect(getEmailSender(env({ EMAIL_FROM: 'no-reply@example.com' }))).toBeInstanceOf(
      SmtpEmailSender,
    );
  });
});
