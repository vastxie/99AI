import {
  ClassifiedProviderError,
  classifyProviderError,
  classifySilentProviderCompletion,
  MODEL_PROVIDER_STATE_REJECTED,
  parseRetryAfterMs,
  toClassifiedProviderError,
  toSafeModelStreamError,
} from './provider-error-classifier';

declare const describe: (name: string, fn: () => void) => void;
declare const it: {
  (name: string, fn: () => void | Promise<void>): void;
  each: (
    cases: readonly (readonly unknown[])[],
  ) => (name: string, fn: (...args: any[]) => void | Promise<void>) => void;
};
declare const expect: any;

describe('provider error classifier', () => {
  it.each([
    [400, 'invalid request', 'invalid_request', 'rejected', false],
    [400, 'maximum context length exceeded', 'context_overflow', 'rejected', false],
    [401, 'raw credential detail', 'auth', 'rejected', false],
    [403, 'forbidden', 'auth', 'rejected', false],
    [408, 'request timeout', 'transient', 'unknown', false],
    [409, 'conflict', 'transient', 'rejected', true],
    [429, 'too many requests', 'rate_limit', 'rejected', true],
    [500, 'private upstream detail', 'transient', 'rejected', true],
    [502, 'bad gateway', 'transient', 'rejected', true],
    [503, 'service unavailable', 'transient', 'rejected', true],
    [504, 'gateway timeout', 'transient', 'rejected', true],
  ])(
    'classifies HTTP %i without exposing raw text',
    (status, message, category, requestOutcome, retryable) => {
      const result = classifyProviderError({ status, message });

      expect(result).toMatchObject({ status, category, requestOutcome, retryable });
      expect(result.message).not.toContain(message);
      expect(result).not.toHaveProperty('raw');
    },
  );

  it('keeps network and abort outcomes unknown and non-retryable', () => {
    expect(classifyProviderError({ code: 'ECONNRESET', message: 'socket secret' })).toMatchObject({
      category: 'unknown',
      requestOutcome: 'unknown',
      retryable: false,
    });
    expect(
      classifyProviderError(
        Object.assign(new Error('private abort reason'), { name: 'AbortError' }),
      ),
    ).toMatchObject({
      category: 'aborted',
      requestOutcome: 'unknown',
      retryable: false,
    });
  });

  it('treats an explicit provider context-limit signal without an HTTP status as rejected', () => {
    expect(
      classifyProviderError({
        code: 'context_length_exceeded',
        message: 'maximum context length contains private payload',
      }),
    ).toEqual({
      code: 'MODEL_CONTEXT_OVERFLOW',
      message: '模型上下文超过限制',
      category: 'context_overflow',
      retryable: false,
      requestOutcome: 'rejected',
    });
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    const now = Date.parse('2026-09-10T00:00:00.000Z');
    expect(parseRetryAfterMs('1.5', now)).toBe(1500);
    expect(parseRetryAfterMs('Wed, 10 Sep 2026 00:00:12 GMT', now)).toBe(12_000);
    expect(parseRetryAfterMs('not-a-date', now)).toBeUndefined();

    expect(
      classifyProviderError(
        { status: 429, headers: { 'retry-after': '3' }, message: 'private detail' },
        { nowMs: now },
      ),
    ).toMatchObject({ category: 'rate_limit', retryAfterMs: 3000 });
  });

  it('keeps the replay-state rejection code only for a rejected invalid request', () => {
    const rejected = {
      code: MODEL_PROVIDER_STATE_REJECTED,
      message: 'PRIVATE_PROVIDER_TEXT',
      category: 'invalid_request' as const,
      retryable: false,
      requestOutcome: 'rejected' as const,
      status: 400,
    };
    const safe = toSafeModelStreamError(rejected);
    expect(safe).toMatchObject({
      code: MODEL_PROVIDER_STATE_REJECTED,
      category: 'invalid_request',
      requestOutcome: 'rejected',
      retryable: false,
      status: 400,
    });
    expect(safe.message).not.toContain('PRIVATE_PROVIDER_TEXT');
    // 网关与平台对已分类异常的再次安全化保留它
    expect(classifyProviderError(new ClassifiedProviderError(rejected)).code).toBe(
      MODEL_PROVIDER_STATE_REJECTED,
    );
    // 其他类别、结果未知或别的错误码一律换成通用错误码
    for (const error of [
      { ...rejected, category: 'transient' as const },
      { ...rejected, requestOutcome: 'unknown' as const },
      { ...rejected, code: 'provider_state_rejected_extra' },
    ]) {
      expect(toSafeModelStreamError(error).code).not.toBe(MODEL_PROVIDER_STATE_REJECTED);
    }
  });

  it('never re-expands an already classified safe exception', () => {
    const exception = toClassifiedProviderError({ status: 503, message: 'private detail' });
    expect(exception).toBeInstanceOf(ClassifiedProviderError);
    expect(classifyProviderError(exception)).toEqual({
      code: 'MODEL_TRANSIENT_ERROR',
      message: '模型服务暂时不可用，请稍后再试',
      category: 'transient',
      retryable: true,
      requestOutcome: 'rejected',
      status: 503,
    });
  });

  it('classifies silent explicit overflow and length near a full context', () => {
    expect(
      classifySilentProviderCompletion({
        finishReason: 'context_length_exceeded',
        outputObserved: false,
        estimatedInputTokens: 10,
        contextWindowTokens: 1000,
      }),
    ).toMatchObject({ category: 'context_overflow', requestOutcome: 'rejected' });

    expect(
      classifySilentProviderCompletion({
        finishReason: 'length',
        usage: { inputTokens: 950, outputTokens: 0, totalTokens: 950 },
        outputObserved: false,
        estimatedInputTokens: 800,
        contextWindowTokens: 1000,
      }),
    ).toMatchObject({ category: 'context_overflow', requestOutcome: 'unknown' });

    expect(
      classifySilentProviderCompletion({
        finishReason: 'length',
        outputObserved: false,
        estimatedInputTokens: 100,
        contextWindowTokens: 1000,
      }),
    ).toBeNull();
  });
});
