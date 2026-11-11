import mongoose from 'mongoose';

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  mongoose.set('sanitizeFilter', false);
  const connection = await mongoose.connect(uri);
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export async function isMongoReady(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) {
      return false;
    }
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}
