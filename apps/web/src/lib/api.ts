export interface ApiErrorDetail {
  path: string;
  issue: string;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetail[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export const API_PREFIX = '/api/v1';

async function parseError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope = {};
  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // Non-JSON error bodies (gateway/proxy) fall back to the status text.
  }
  const error = envelope.error;
  return new ApiError(
    response.status,
    error?.code ?? 'INTERNAL',
    error?.message ?? response.statusText ?? 'Request failed',
    error?.details ?? [],
    error?.requestId,
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API. Check your connection and try again.');
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function fieldError(error: ApiError, field: string): string | undefined {
  const detail = error.details.find((item) => item.path === field);
  if (detail === undefined) {
    return undefined;
  }
  return humanizeIssue(detail.issue);
}

export function humanizeIssue(issue: string): string {
  switch (issue) {
    case 'invalid_string':
    case 'invalid_format':
      return 'Enter a valid value.';
    case 'too_small':
      return 'This value is too short.';
    case 'too_big':
      return 'This value is too long.';
    case 'invalid_type':
      return 'This field is required.';
    case 'invalid_enum_value':
      return 'Choose one of the available options.';
    default:
      return 'Check this value and try again.';
  }
}
