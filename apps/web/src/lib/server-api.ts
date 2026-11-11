import { cookies } from 'next/headers';
import type { ApiErrorDetail } from './api';

export class ServerApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ServerApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:4000';
}

/**
 * Server Component fetch that forwards the session cookie to the API.
 * Business rules stay in the API; this helper only transports the session.
 */
export async function serverApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = await cookies();
  const headers = new Headers(init.headers);
  headers.set('cookie', cookieStore.toString());
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new ServerApiError(0, 'NETWORK', 'Cannot reach the API');
  }
  if (!response.ok) {
    let body: { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Keep the status-based fallback below.
    }
    throw new ServerApiError(
      response.status,
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? response.statusText,
      body.error?.details ?? [],
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ServerApiError && error.status === 401;
}
