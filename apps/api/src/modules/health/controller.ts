import type { Request, Response } from 'express';
import { getHealth, getReadiness, type HealthResult, type ReadinessResult } from './service';

export interface HealthDeps {
  isMongoReady: () => Promise<boolean>;
  isStorageReady: () => Promise<void>;
}

export function createHealthHandlers(deps: HealthDeps) {
  return {
    health: (_req: Request, res: Response<HealthResult>): void => {
      res.json(getHealth());
    },
    readiness: (_req: Request, res: Response<ReadinessResult>): void => {
      void getReadiness(deps).then((result) => {
        res.json(result);
      });
    },
  };
}
