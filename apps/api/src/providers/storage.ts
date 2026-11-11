import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env';

export interface PresignPostInput {
  key: string;
  contentType?: string;
  contentLength?: number;
}

export interface PresignPostResult {
  url: string;
  fields: Record<string, string>;
}

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  presignPost(input: PresignPostInput): Promise<PresignPostResult>;
  ping(): Promise<void>;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(env: Env) {
    const config: S3ClientConfig = {
      region: env.STORAGE_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    };
    if (env.STORAGE_ENDPOINT !== undefined) {
      config.endpoint = env.STORAGE_ENDPOINT;
    }
    this.client = new S3Client(config);
    this.bucket = env.STORAGE_BUCKET;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    return url;
  }

  async presignPost(input: PresignPostInput): Promise<PresignPostResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ...(input.contentLength === undefined ? {} : { ContentLength: input.contentLength }),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 60 });
    const fields: Record<string, string> = {};
    if (input.contentType !== undefined) {
      fields['content-type'] = input.contentType;
    }
    return { url, fields };
  }

  async ping(): Promise<void> {
    await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const entry = this.objects.get(key);
    if (entry === undefined) {
      throw new Error('not found');
    }
    return entry.body;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return `http://localhost:9000/takeoff-estimator-dev/${key}?presigned=true&ttl=${ttlSeconds}`;
  }

  async presignPost(input: PresignPostInput): Promise<PresignPostResult> {
    return {
      url: `http://localhost:9000/takeoff-estimator-dev/${input.key}`,
      fields: { key: input.key },
    };
  }

  async ping(): Promise<void> {
    return Promise.resolve();
  }
}

export function createObjectStorage(env: Env): ObjectStorage {
  return new S3ObjectStorage(env);
}
