/**
 * Self-contained E2E stack: in-process MongoDB, the real Express API, an
 * in-memory object store exposed over HTTP (so browser uploads and signed
 * downloads work without Docker/MinIO), and the ingestion + pipeline worker.
 *
 * Only test users and pricing are seeded. Everything else (project, upload,
 * intake, submission, review, delivery) is produced by the flows under test.
 */
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import argon2 from 'argon2';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../apps/api/src/app';
import { isMongoReady } from '../apps/api/src/db/mongo';
import { User } from '../apps/api/src/modules/auth/auth.model';
import {
  claimNextDrawingFile,
  runIngestion,
} from '../apps/api/src/modules/ingestion/ingestion.service';
import { claimNextJob, runNextStage } from '../apps/api/src/modules/jobs/job.service';
import { seedPricingPlans } from '../apps/api/src/modules/pricing/pricing.seed';
import type {
  ObjectStorage,
  PresignPostInput,
  PresignPostResult,
} from '../apps/api/src/providers/storage';
import { E2E } from './config';

process.env.NODE_ENV = 'test';
process.env.PORT = String(E2E.apiPort);
process.env.APP_ORIGIN = E2E.webOrigin;
process.env.API_BASE_URL = E2E.apiOrigin;
process.env.PROCESSING_MODE = 'fixture';
process.env.LOG_LEVEL = 'warn';
process.env.STORAGE_BUCKET = 'takeoff-estimator-e2e';
process.env.STORAGE_ACCESS_KEY_ID = 'e2e-access-key';
process.env.STORAGE_SECRET_ACCESS_KEY = 'e2e-secret-key';
process.env.COOKIE_SECURE = 'false';
delete process.env.COOKIE_DOMAIN;

interface StoredObject {
  body: Buffer;
  contentType: string;
}

const objects = new Map<string, StoredObject>();

class GatewayObjectStorage implements ObjectStorage {
  constructor(
    private readonly store: Map<string, StoredObject>,
    private readonly origin: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.store.set(key, { body, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const object = this.store.get(key);
    if (object === undefined) {
      throw new Error(`Object not found: ${key}`);
    }
    return object.body;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    const url = new URL(`/object/${encodeURIComponent(key)}`, this.origin);
    url.searchParams.set('download', '1');
    url.searchParams.set('ttl', String(ttlSeconds));
    return url.toString();
  }

  async presignPost(input: PresignPostInput): Promise<PresignPostResult> {
    const url = new URL(`/object/${encodeURIComponent(input.key)}`, this.origin);
    url.searchParams.set('upload', '1');
    return { url: url.toString(), fields: {} };
  }

  async ping(): Promise<void> {
    return Promise.resolve();
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function writeCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

async function handleObjectRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  writeCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', E2E.storageOrigin);
  if (!url.pathname.startsWith('/object/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  const key = decodeURIComponent(url.pathname.slice('/object/'.length));
  const contentTypeHeader = req.headers['content-type'];
  const contentType =
    typeof contentTypeHeader === 'string' ? contentTypeHeader : 'application/octet-stream';

  if (req.method === 'PUT') {
    const body = await readBody(req);
    objects.set(key, { body, contentType });
    res.writeHead(200, { 'Content-Length': '0' });
    res.end();
    return;
  }
  if (req.method === 'GET') {
    const object = objects.get(key);
    if (object === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': object.contentType,
      'Content-Length': String(object.body.length),
    });
    res.end(object.body);
    return;
  }
  if (req.method === 'DELETE') {
    objects.delete(key);
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(405);
  res.end();
}

function startGateway(): Server {
  return createServer((req, res) => {
    void handleObjectRequest(req, res).catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
}

async function seedTestUsers(): Promise<void> {
  const passwordHash = await argon2.hash(E2E.password, { type: argon2.argon2id });
  await User.create([
    {
      email: E2E.reviewerEmail,
      passwordHash,
      name: E2E.reviewerName,
      role: 'reviewer',
      isActive: true,
    },
    {
      email: E2E.adminEmail,
      passwordHash,
      name: E2E.adminName,
      role: 'admin',
      isActive: true,
    },
  ]);
}

async function start(): Promise<void> {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('takeoff_e2e');

  await mongoose.connect(process.env.MONGODB_URI);
  await seedPricingPlans('e2e-harness');
  await seedTestUsers();

  const storage = new GatewayObjectStorage(objects, E2E.storageOrigin);
  const app = createApp({ storage, isMongoReady });
  const apiServer = app.listen(E2E.apiPort, '127.0.0.1');
  await once(apiServer, 'listening');

  const gateway = startGateway();
  gateway.listen(E2E.storagePort, '127.0.0.1');
  await once(gateway, 'listening');

  let ticking = false;
  const tick = async (): Promise<void> => {
    if (ticking) {
      return;
    }
    ticking = true;
    try {
      for (let index = 0; index < 10; index += 1) {
        const file = await claimNextDrawingFile();
        if (file === null) {
          break;
        }
        await runIngestion(file);
      }
      for (let index = 0; index < 10; index += 1) {
        const job = await claimNextJob();
        if (job === null) {
          break;
        }
        const jobId = job._id.toString();
        for (let stage = 0; stage < 10; stage += 1) {
          const updated = await runNextStage(jobId);
          if (updated.status !== 'processing') {
            break;
          }
        }
      }
    } catch (error: unknown) {
      console.error('e2e worker tick failed', error);
    } finally {
      ticking = false;
    }
  };
  const workerTimer = setInterval(() => {
    void tick();
  }, 400);

  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) {
      return;
    }
    closing = true;
    clearInterval(workerTimer);
    apiServer.close();
    gateway.close();
    await mongoose.disconnect().catch(() => undefined);
    await mongo.stop().catch(() => undefined);
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown().then(() => process.exit(0));
    });
  }

  console.log(`e2e harness ready (api ${E2E.apiOrigin}, storage ${E2E.storageOrigin})`);
}

void start().catch((error: unknown) => {
  console.error('e2e harness failed to start', error);
  process.exitCode = 1;
});
