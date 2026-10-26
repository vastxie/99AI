import type { ModelStreamErrorCategory } from './model-stream.types';

export const PROVIDER_RETRY_MAX_RETRIES = 2;
export const PROVIDER_RETRY_MAX_DELAY_MS = 30_000;

export interface ProviderRetryPlan {
  delayMs: number;
  notBeforeMs: number;
}

export function planProviderRetry(input: {
  category: ModelStreamErrorCategory;
  retryIndex: number;
  retryAfterMs?: number;
  nowMs?: number;
  random?: () => number;
}): ProviderRetryPlan | null {
  if (input.category !== 'rate_limit' && input.category !== 'transient') return null;
  const retryIndex = Math.max(0, Math.floor(Number(input.retryIndex) || 0));
  if (retryIndex >= PROVIDER_RETRY_MAX_RETRIES) return null;

  const baseMs = input.category === 'rate_limit' ? 1_000 : 500;
  const exponentialMs = Math.min(PROVIDER_RETRY_MAX_DELAY_MS, baseMs * 2 ** retryIndex);
  const randomValue = clamp(Number((input.random || Math.random)()), 0, 1);
  const jitteredMs = Math.round(exponentialMs * (0.8 + randomValue * 0.4));
  const retryAfterMs = Math.max(0, Math.ceil(Number(input.retryAfterMs) || 0));
  const delayMs = Math.min(PROVIDER_RETRY_MAX_DELAY_MS, Math.max(jitteredMs, retryAfterMs));
  const parsedNowMs = Number(input.nowMs);
  const nowMs =
    input.nowMs !== undefined && Number.isFinite(parsedNowMs)
      ? Math.floor(parsedNowMs)
      : Date.now();
  return { delayMs, notBeforeMs: nowMs + delayMs };
}

export function waitForProviderRetry(input: {
  delayMs: number;
  signal?: AbortSignal;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}): Promise<void> {
  const delayMs = Math.max(0, Math.floor(Number(input.delayMs) || 0));
  if (input.signal?.aborted) return Promise.reject(abortReason(input.signal));
  const schedule = input.schedule || ((callback, ms) => setTimeout(callback, ms));
  const cancel = input.cancel || (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));

  return new Promise((resolve, reject) => {
    let settled = false;
    let handle: unknown;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      input.signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => {
      if (handle !== undefined) cancel(handle);
      finish(() => reject(abortReason(input.signal)));
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });
    handle = schedule(() => finish(resolve), delayMs);
    if (input.signal?.aborted) onAbort();
  });
}

function abortReason(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('Model retry aborted');
  error.name = 'AbortError';
  return error;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
