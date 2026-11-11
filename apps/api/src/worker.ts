import { loadEnv } from './config/env';
import { connectDatabase, disconnectDatabase } from './db/mongo';
import { logger } from './middleware/logger';
import { claimNextDrawingFile, runIngestion } from './modules/ingestion/ingestion.service';
import { resolveIntakeProvider } from './modules/ingestion/intakeProvider';
import { claimNextJob, runNextStage } from './modules/jobs/job.service';

const MAX_JOBS_PER_RUN = 100;

export async function runWorker(): Promise<void> {
  const env = loadEnv();
  // Fail before connecting (and before claiming any work) when the configured
  // processing mode has no usable provider. Never fall back to fixture data.
  const intakeProvider = resolveIntakeProvider(env);
  logger.info({ provider: intakeProvider.id }, 'worker_processing_provider');
  await connectDatabase(env.MONGODB_URI);
  try {
    for (;;) {
      const file = await claimNextDrawingFile();
      if (file === null) {
        break;
      }
      await runIngestion(file);
    }
    let processed = 0;
    for (;;) {
      const job = await claimNextJob();
      if (job === null) {
        break;
      }
      await runNextStage(job._id.toString());
      processed += 1;
      if (processed >= MAX_JOBS_PER_RUN) {
        break;
      }
    }
  } finally {
    await disconnectDatabase();
  }
}

void runWorker();
