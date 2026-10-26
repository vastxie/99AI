import { AllExceptionsFilter } from '@/common/filters/allExceptions.filter';
import { HttpException } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/* 拦截器按处理器元数据判断是否原样输出；这里的处理器没有 @RawResponse() 标记 */
class TestController {}
function handler() {}

type ProjectedResponse = {
  code: string | number;
  message: string;
  messageKey?: string;
  reason?: string;
  data: unknown;
};

async function projectThroughGlobalHttpErrorChain(exception: HttpException) {
  const interceptor = new TransformInterceptor();
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getResponse: () => ({}),
      getRequest: () => ({ path: '/api/test' }),
    }),
  };

  let transformed: unknown;
  try {
    await firstValueFrom(
      interceptor.intercept(context as any, {
        handle: () => throwError(() => exception),
      }),
    );
  } catch (error) {
    transformed = error;
  }

  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = {
    headersSent: false,
    writableEnded: false,
    status,
  };
  const host = {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ path: '/api/test' }),
    }),
  };

  new AllExceptionsFilter().catch(transformed, host as any);

  return {
    transformed: transformed as HttpException,
    status: status.mock.calls[0]?.[0] as number,
    body: json.mock.calls[0]?.[0] as ProjectedResponse,
  };
}

describe('TransformInterceptor HTTP error projection', () => {
  it.each(['SUBMISSION_CONFLICT', 'SUBMISSION_RECORD_INCOMPLETE', 'EXECUTION_START_FAILED'])(
    'preserves the allowlisted %s code through the interceptor and final filter',
    async (code: string) => {
      const result = await projectThroughGlobalHttpErrorChain(
        new HttpException(
          {
            code,
            message: '安全业务提示',
            data: { provider: 'must-not-leak' },
            providerResponse: { secret: 'must-not-leak' },
            stack: 'must-not-leak',
          },
          409,
        ),
      );

      expect(result.status).toBe(409);
      expect(result.transformed.getResponse()).toEqual({
        code,
        message: '安全业务提示',
      });
      expect(result.body).toEqual({
        code,
        message: '安全业务提示',
        messageKey: undefined,
        reason: undefined,
        data: null,
      });
      expect(JSON.stringify(result.body)).not.toContain('provider');
      expect(JSON.stringify(result.body)).not.toContain('stack');
      expect(JSON.stringify(result.body)).not.toContain('secret');
    },
  );

  it('passes a short string reason through for allowlisted codes while stripping everything else', async () => {
    const result = await projectThroughGlobalHttpErrorChain(
      new HttpException(
        {
          code: 'SUBMISSION_CONFLICT',
          message: '提交内容冲突',
          reason: 'fingerprint_mismatch',
          data: { provider: 'must-not-leak' },
          providerResponse: { secret: 'must-not-leak' },
          stack: 'must-not-leak',
        },
        409,
      ),
    );

    expect(result.status).toBe(409);
    expect(result.transformed.getResponse()).toEqual({
      code: 'SUBMISSION_CONFLICT',
      message: '提交内容冲突',
      reason: 'fingerprint_mismatch',
    });
    expect(result.body).toEqual({
      code: 'SUBMISSION_CONFLICT',
      message: '提交内容冲突',
      messageKey: undefined,
      reason: 'fingerprint_mismatch',
      data: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('provider');
    expect(JSON.stringify(result.body)).not.toContain('stack');
    expect(JSON.stringify(result.body)).not.toContain('secret');
  });

  it('drops non-string reason payloads even for allowlisted codes', async () => {
    const result = await projectThroughGlobalHttpErrorChain(
      new HttpException(
        {
          code: 'SUBMISSION_CONFLICT',
          message: '提交内容冲突',
          reason: { providerDetail: 'must-not-leak' },
        },
        409,
      ),
    );

    expect(result.transformed.getResponse()).toEqual({
      code: 'SUBMISSION_CONFLICT',
      message: '提交内容冲突',
    });
    expect(result.body).toEqual({
      code: 'SUBMISSION_CONFLICT',
      message: '提交内容冲突',
      messageKey: undefined,
      reason: undefined,
      data: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('providerDetail');
  });

  it('drops unlisted provider-like codes and response fields including reason', async () => {
    const result = await projectThroughGlobalHttpErrorChain(
      new HttpException(
        {
          code: 'PROVIDER_RATE_LIMIT_SECRET',
          message: '请求暂时不可用',
          reason: 'private-upstream-reason',
          providerResponse: { requestId: 'private-request-id' },
        },
        429,
      ),
    );

    expect(result.transformed.getResponse()).toBe('请求暂时不可用');
    expect(result.body).toEqual({
      code: 429,
      message: '请求暂时不可用',
      messageKey: undefined,
      reason: undefined,
      data: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('PROVIDER_RATE_LIMIT_SECRET');
    expect(JSON.stringify(result.body)).not.toContain('private-request-id');
    expect(JSON.stringify(result.body)).not.toContain('private-upstream-reason');
  });
});

describe('TransformInterceptor outside HTTP', () => {
  it('returns WebSocket gateway acks unchanged', async () => {
    // NestJS 12 把全局拦截器也应用到网关：ack 被包成 { code, data, success } 会让用户端读不到 ok / code
    const interceptor = new TransformInterceptor();
    const ack = { ok: false, code: 'UNAUTHORIZED', message: '请先登录' };
    const context = {
      getType: () => 'ws',
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => {
        throw new Error('WebSocket 上下文不应读取 HTTP 响应');
      },
    };

    await expect(
      firstValueFrom(interceptor.intercept(context as any, { handle: () => of(ack) })),
    ).resolves.toBe(ack);
  });
});

describe('TransformInterceptor HTTP success status', () => {
  async function runWithStatus(statusCode: number) {
    const response = { statusCode };
    const context = {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ path: '/api/test' }),
      }),
    };
    await firstValueFrom(
      new TransformInterceptor().intercept(context as any, { handle: () => of({ ok: true }) }),
    );
    return response.statusCode;
  }

  it('normalizes the default POST 201 to 200', async () => {
    expect(await runWithStatus(201)).toBe(200);
  });

  it('keeps statuses set by the handler, such as a partial file response', async () => {
    // 文件分段：处理器先设 206 再开始输出流，响应头可能晚于拦截器才发出
    expect(await runWithStatus(206)).toBe(206);
    expect(await runWithStatus(200)).toBe(200);
  });
});
