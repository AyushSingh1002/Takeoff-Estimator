export interface HealthDeps {
  isMongoReady: () => Promise<boolean>;
  isStorageReady: () => Promise<void>;
}

export interface HealthResult {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  checks: {
    mongo: { status: 'up' | 'down' };
    storage: { status: 'up' | 'down' };
  };
}

export function getHealth(): HealthResult {
  return {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export async function getReadiness(deps: HealthDeps): Promise<ReadinessResult> {
  let mongoStatus: 'up' | 'down' = 'down';
  try {
    if (await deps.isMongoReady()) {
      mongoStatus = 'up';
    }
  } catch {
    mongoStatus = 'down';
  }

  let storageStatus: 'up' | 'down' = 'down';
  try {
    await deps.isStorageReady();
    storageStatus = 'up';
  } catch {
    storageStatus = 'down';
  }

  const status = mongoStatus === 'up' && storageStatus === 'up' ? 'ready' : 'not_ready';
  return { status, checks: { mongo: { status: mongoStatus }, storage: { status: storageStatus } } };
}
