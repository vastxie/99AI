import { HttpException, Logger } from '@nestjs/common';
import { getErrorStack, getSafeErrorSummary, rethrowAsSafeException } from './error-stack.util';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('getErrorStack', () => {
  it('returns stack text for Error instances', () => {
    const error = new Error('boom');

    expect(getErrorStack(error)).toContain('Error: boom');
  });

  it('returns undefined for non Error values', () => {
    expect(getErrorStack('boom')).toBeUndefined();
    expect(getErrorStack(null)).toBeUndefined();
  });
});

describe('getSafeErrorSummary', () => {
  it('keeps only the type, the error code and errno — never the message or the stack', () => {
    const error = Object.assign(
      new Error(
        "Duplicate entry 'dedup-synthetic@example.test' for key 'IDX'\n    at dedup-synthetic@example.test (fake)",
      ),
      { code: 'ER_DUP_ENTRY', errno: 1062, sqlMessage: 'dedup-synthetic@example.test' },
    );
    expect(getSafeErrorSummary(error)).toBe('Error code=ER_DUP_ENTRY errno=1062');
  });

  it('drops names, codes and errno values outside the allowlists', () => {
    const error = Object.assign(new Error('x'), {
      name: 'Bad Name: dedup-synthetic@example.test',
      code: 'er_dup_entry dedup-synthetic@example.test',
      errno: '1062',
    });
    expect(getSafeErrorSummary(error)).toBe('Error');
    const named = Object.assign(new Error('x'), {
      name: 'QueryFailedError',
      code: 'ECONNRESET',
      errno: -104,
    });
    expect(getSafeErrorSummary(named)).toBe('QueryFailedError code=ECONNRESET errno=-104');
  });

  it('handles values that are not errors', () => {
    expect(getSafeErrorSummary(undefined)).toBe('Error');
    expect(getSafeErrorSummary('dedup-synthetic@example.test')).toBe('Error');
    expect(getSafeErrorSummary({ code: 'ER_LOCK_DEADLOCK', errno: 1213 })).toBe(
      'Error code=ER_LOCK_DEADLOCK errno=1213',
    );
  });
});

describe('rethrowAsSafeException', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes HttpException through without logging', () => {
    const logged = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const original = new HttpException('业务提示', 400);
    expect(() =>
      rethrowAsSafeException(original, '静态文案', 'Ctx', () => new HttpException('替换', 500)),
    ).toThrow(original);
    expect(logged).not.toHaveBeenCalled();
  });

  it('logs a static message with the safe summary and throws the replacement instead', () => {
    const logged = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const replacement = new HttpException('替换', 500);
    const raw = Object.assign(new Error('dedup-synthetic@example.test'), {
      code: 'ER_LOCK_WAIT_TIMEOUT',
    });
    expect(() => rethrowAsSafeException(raw, '静态文案', 'Ctx', () => replacement)).toThrow(
      replacement,
    );
    expect(logged).toHaveBeenCalledWith('静态文案', 'Error code=ER_LOCK_WAIT_TIMEOUT', 'Ctx');
  });
});
