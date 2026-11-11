import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const envFilePaths = ['.env.local', '.env']
  .map((fileName) => resolve(__dirname, '../../../../', fileName))
  .filter(existsSync);

if (envFilePaths.length > 0) {
  const result = loadDotenv({ path: envFilePaths, quiet: true });
  if (result.error) {
    throw result.error;
  }
}

const boolFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const envKeys = [
  'NODE_ENV',
  'PORT',
  'APP_ORIGIN',
  'MONGODB_URI',
  'SESSION_IDLE_MINUTES',
  'SESSION_ABSOLUTE_HOURS',
  'COOKIE_DOMAIN',
  'COOKIE_SECURE',
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'UPLOAD_MAX_BYTES',
  'UPLOAD_MAX_FILES',
  'INGEST_MAX_PAGES',
  'SIGNED_URL_TTL_SECONDS',
  'PROCESSING_MODE',
  'OCR_PROVIDER',
  'OCR_API_KEY',
  'VISION_PROVIDER',
  'VISION_API_KEY',
  'VISION_MODEL',
  'JOB_LEASE_SECONDS',
  'JOB_MAX_ATTEMPTS',
  'JOB_COST_CEILING_USD',
  'EMAIL_PROVIDER',
  'EMAIL_API_KEY',
  'EMAIL_FROM',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASSWORD',
  'FEATURE_EXPRESS',
  'FEATURE_PAYMENTS',
  'LOG_LEVEL',
] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_ORIGIN: z.string().url(),
    MONGODB_URI: z.string().min(1),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: boolFromEnv.default('false'),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().optional(),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(26214400),
    UPLOAD_MAX_FILES: z.coerce.number().int().positive().default(50),
    INGEST_MAX_PAGES: z.coerce.number().int().positive().default(100),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(300).default(60),
    PROCESSING_MODE: z.enum(['provider', 'fixture']),
    OCR_PROVIDER: z.string().optional(),
    OCR_API_KEY: z.string().optional(),
    VISION_PROVIDER: z.string().optional(),
    VISION_API_KEY: z.string().optional(),
    VISION_MODEL: z.string().optional(),
    JOB_LEASE_SECONDS: z.coerce.number().int().positive().default(60),
    JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    JOB_COST_CEILING_USD: z.coerce.number().nonnegative().default(50),
    EMAIL_PROVIDER: z.string().optional(),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    EMAIL_SMTP_HOST: z.string().min(1).optional(),
    EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(1025),
    EMAIL_SMTP_USER: z.string().optional(),
    EMAIL_SMTP_PASSWORD: z.string().optional(),
    FEATURE_EXPRESS: boolFromEnv.default('false'),
    FEATURE_PAYMENTS: boolFromEnv.default('false'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
  })
  .strict();

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const filtered: Record<string, string | undefined> = {};
  for (const key of envKeys) {
    filtered[key] = source[key];
  }
  const parsed = envSchema.parse(filtered);
  validateProductionConfig(parsed);
  return parsed;
}

function requireHttps(name: 'APP_ORIGIN', value: string): void {
  if (!value.startsWith('https://')) {
    throw new Error(`Invalid configuration: ${name} must use https in production`);
  }
}

function validateProductionConfig(env: Env): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }
  if (env.PROCESSING_MODE !== 'provider') {
    throw new Error(
      'Invalid configuration: fixture processing is not allowed with NODE_ENV=production',
    );
  }
  if (!env.COOKIE_SECURE) {
    throw new Error('Invalid configuration: COOKIE_SECURE must be true in production');
  }
  requireHttps('APP_ORIGIN', env.APP_ORIGIN);
  if (env.STORAGE_BUCKET.trim().length === 0) {
    throw new Error('Invalid configuration: STORAGE_BUCKET is required in production');
  }
  if (
    env.STORAGE_ACCESS_KEY_ID.trim().length === 0 ||
    env.STORAGE_SECRET_ACCESS_KEY.trim().length === 0
  ) {
    throw new Error('Invalid configuration: storage credentials are required in production');
  }
  if (env.EMAIL_FROM === undefined) {
    throw new Error('Invalid configuration: EMAIL_FROM is required in production');
  }
  if (env.EMAIL_SMTP_HOST === undefined) {
    throw new Error('Invalid configuration: EMAIL_SMTP_HOST is required in production');
  }
}
