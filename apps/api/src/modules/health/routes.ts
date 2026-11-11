import { Router } from 'express';
import { createHealthHandlers, type HealthDeps } from './controller';

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();
  const handlers = createHealthHandlers(deps);
  router.get('/health', handlers.health);
  router.get('/ready', handlers.readiness);
  return router;
}
