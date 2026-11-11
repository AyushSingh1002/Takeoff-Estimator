import { loadEnv } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../db/mongo';
import { seedPricingPlans } from '../modules/pricing/pricing.seed';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);
  try {
    await seedPricingPlans('seed-script');
    process.stdout.write('Pricing plans seeded\n');
  } finally {
    await disconnectDatabase();
  }
}

void main();
