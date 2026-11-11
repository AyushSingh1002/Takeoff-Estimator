import pino from 'pino';
import type { Logger } from 'pino';
import { getRequestId } from './requestId';

const level = process.env.LOG_LEVEL ?? 'info';

export const logger: Logger = pino({
  level,
  base: { pid: process.pid },
});

export function contextLogger(): Logger {
  const requestId = getRequestId();
  if (requestId === 'unknown') {
    return logger;
  }
  return logger.child({ requestId });
}
