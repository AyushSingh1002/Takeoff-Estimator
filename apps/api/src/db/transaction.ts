import mongoose from 'mongoose';

type MongoClientSession = Awaited<ReturnType<typeof mongoose.connection.startSession>>;

type SessionFn = (session: MongoClientSession) => Promise<unknown>;

export async function withTransaction<T>(fn: SessionFn): Promise<T> {
  const session = await mongoose.connection.startSession();
  try {
    await session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result as T;
  } catch (error: unknown) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
