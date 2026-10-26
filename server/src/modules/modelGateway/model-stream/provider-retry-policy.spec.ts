import {
  PROVIDER_RETRY_MAX_DELAY_MS,
  planProviderRetry,
  waitForProviderRetry,
} from './provider-retry-policy';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: any;
declare const jest: any;

describe('provider retry policy', () => {
  it('uses bounded exponential backoff with injectable jitter', () => {
    expect(
      planProviderRetry({ category: 'transient', retryIndex: 0, nowMs: 1000, random: () => 0 }),
    ).toEqual({ delayMs: 400, notBeforeMs: 1400 });
    expect(
      planProviderRetry({ category: 'transient', retryIndex: 1, nowMs: 1000, random: () => 1 }),
    ).toEqual({ delayMs: 1200, notBeforeMs: 2200 });
    expect(
      planProviderRetry({ category: 'rate_limit', retryIndex: 0, nowMs: 1000, random: () => 0.5 }),
    ).toEqual({ delayMs: 1000, notBeforeMs: 2000 });
    expect(
      planProviderRetry({ category: 'transient', retryIndex: 0, nowMs: 0, random: () => 0 }),
    ).toEqual({ delayMs: 400, notBeforeMs: 400 });
  });

  it('respects Retry-After up to the maximum delay and stops after two retries', () => {
    expect(
      planProviderRetry({
        category: 'rate_limit',
        retryIndex: 0,
        retryAfterMs: 12_000,
        nowMs: 1000,
        random: () => 0,
      }),
    ).toEqual({ delayMs: 12_000, notBeforeMs: 13_000 });
    expect(
      planProviderRetry({
        category: 'rate_limit',
        retryIndex: 1,
        retryAfterMs: 120_000,
        nowMs: 1000,
        random: () => 0,
      }),
    ).toEqual({
      delayMs: PROVIDER_RETRY_MAX_DELAY_MS,
      notBeforeMs: 1000 + PROVIDER_RETRY_MAX_DELAY_MS,
    });
    expect(planProviderRetry({ category: 'transient', retryIndex: 2 })).toBeNull();
    expect(planProviderRetry({ category: 'unknown', retryIndex: 0 })).toBeNull();
  });

  it('waits through an injected non-blocking scheduler', async () => {
    let callback: (() => void) | undefined;
    const schedule = jest.fn((next: () => void) => {
      callback = next;
      return 7;
    });
    const waiting = waitForProviderRetry({ delayMs: 25, schedule, cancel: jest.fn() });
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 25);
    callback?.();
    await expect(waiting).resolves.toBeUndefined();
  });

  it('cancels a pending wait immediately', async () => {
    const controller = new AbortController();
    const cancel = jest.fn();
    const waiting = waitForProviderRetry({
      delayMs: 30_000,
      signal: controller.signal,
      schedule: () => 9,
      cancel,
    });
    const reason = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledWith(9);
  });

  it('observes an abort that happens synchronously while scheduling', async () => {
    const controller = new AbortController();
    const cancel = jest.fn();
    const reason = Object.assign(new Error('cancelled while scheduling'), {
      name: 'AbortError',
    });
    const waiting = waitForProviderRetry({
      delayMs: 30_000,
      signal: controller.signal,
      schedule: () => {
        controller.abort(reason);
        return 11;
      },
      cancel,
    });

    await expect(waiting).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledWith(11);
  });
});
