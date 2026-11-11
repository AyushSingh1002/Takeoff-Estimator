import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loadEnv, type Env } from './config/env';
import { requestIdMiddleware, getRequestId } from './middleware/requestId';
import { contextLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';
import { rejectOperatorKeys } from './middleware/rejectOperatorKeys';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createProjectsRouter } from './modules/projects/project.routes';
import { createHealthRouter } from './modules/health/routes';
import { createReviewRouter } from './modules/review/review.routes';
import { createDeliverablesRouter } from './modules/deliverables/deliverables.routes';
import { createPricingRouter } from './modules/pricing/pricing.routes';
import { createAdminRouter } from './modules/admin/admin.routes';
import { createAccuracyRouter } from './modules/accuracy/accuracy.routes';
import type { ObjectStorage } from './providers/storage';

export interface AppDeps {
  storage: ObjectStorage;
  isMongoReady: () => Promise<boolean>;
}

export function createApp(deps: AppDeps): Express {
  const env: Env = loadEnv();
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.APP_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rejectOperatorKeys);
  app.use(requestIdMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      contextLogger().info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode ?? 0,
          durationMs: Date.now() - start,
          requestId: getRequestId(),
        },
        'http_request',
      );
    });
    next();
  });
  app.use(
    '/api/v1',
    apiRateLimiter,
    createAuthRouter(),
    createProjectsRouter({ storage: deps.storage }),
    createHealthRouter({
      isMongoReady: deps.isMongoReady,
      isStorageReady: async () => {
        await deps.storage.ping();
      },
    }),
    createReviewRouter({ storage: deps.storage }),
    createDeliverablesRouter({ storage: deps.storage }),
    createPricingRouter(),
    createAdminRouter(),
    createAccuracyRouter(),
  );
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: getRequestId() },
    });
  });
  app.use(errorHandler);

  return app;
}
