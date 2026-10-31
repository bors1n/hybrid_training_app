import {
  PullResponseSchema,
  PushResponseSchema,
  type PullResponse,
  type PushResponse,
  type SyncRecord,
} from '@hybridlog/shared';
import type { z } from 'zod';
import { AuthError, NetworkError, type Transport } from './engine.ts';

const TIMEOUT_MS = 20_000;

/** Слишком частые запросы (429): повторять сразу бессмысленно. */
export class RateLimitError extends Error {}

/** fetch с таймаутом; сетевые сбои и 5xx — NetworkError, 401 — AuthError, 429 — RateLimitError. */
export async function request<S extends z.ZodType>(
  url: string,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new NetworkError('Нет связи с сервером');
  }
  if (res.status === 401) throw new AuthError('Нужен вход');
  if (res.status === 429) throw new RateLimitError('Слишком много запросов');
  if (res.status >= 500) throw new NetworkError(`Сервер ответил ${res.status}`);
  if (!res.ok) throw new Error(`Запрос отклонён: ${res.status}`);
  return schema.parse(await res.json());
}

export const httpTransport: Transport = {
  push: (records: SyncRecord[]): Promise<PushResponse> =>
    request('/api/sync', PushResponseSchema, { method: 'POST', body: JSON.stringify({ records }) }),
  pull: (since: number, limit: number): Promise<PullResponse> =>
    request(`/api/sync?since=${since}&limit=${limit}`, PullResponseSchema),
};
