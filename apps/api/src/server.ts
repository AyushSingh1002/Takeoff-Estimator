import { createApp } from './app';
import { loadEnv } from './config/env';
import { connectDatabase, isMongoReady } from './db/mongo';
import { logger } from './middleware/logger';
import { createObjectStorage } from './providers/storage';

export async function startServer(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);
  const app = createApp({
    storage: createObjectStorage(env),
    isMongoReady,
  });
  await app.listen(env.PORT);
  logger.info({ port: env.PORT }, 'api_listening');
}

void startServer().catch((error: unknown) => {
  logger.fatal({ err: error }, 'api_startup_failed');
  process.exitCode = 1;
});
