import type { ApiErrorPayload } from '@/core/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractErrorMessage(data: unknown): string | undefined {
  if (isRecord(data) && typeof data.message === 'string') return data.message;
  return undefined;
}

export function isApiErrorPayload(data: unknown): data is ApiErrorPayload {
  if (!isRecord(data)) return false;

  const hasCode = typeof data.code === 'string' || typeof data.code === 'number';
  const hasMessage = typeof data.message === 'string';

  return hasCode && hasMessage;
}
