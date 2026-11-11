import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { loadEnv, type Env } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * SMTP adapter (Mailpit in dev, an SMTP relay in staging/production).
 * Configuration is validated at boot; message content never includes secrets.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(env: Env) {
    if (env.EMAIL_FROM === undefined) {
      throw new Error('EMAIL_FROM is required to send email');
    }
    const user = env.EMAIL_SMTP_USER;
    const options = {
      host: env.EMAIL_SMTP_HOST ?? 'localhost',
      port: env.EMAIL_SMTP_PORT,
      secure: env.EMAIL_SMTP_PORT === 465,
      ...(user === undefined ? {} : { auth: { user, pass: env.EMAIL_SMTP_PASSWORD ?? '' } }),
    };
    this.transport = nodemailer.createTransport(options);
    this.from = env.EMAIL_FROM;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Test/dev double: records messages instead of contacting a server. */
export class InMemoryEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

let override: EmailSender | null = null;

/** Replace the transport in tests; pass `null` to restore the real sender. */
export function setEmailSenderForTesting(sender: EmailSender | null): void {
  override = sender;
}

export function getEmailSender(env: Env = loadEnv()): EmailSender {
  return override ?? new SmtpEmailSender(env);
}
