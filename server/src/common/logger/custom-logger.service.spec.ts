import { ConsoleLogger } from '@nestjs/common';
import { CustomLoggerService } from './custom-logger.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;
declare const afterEach: any;

describe('CustomLoggerService', () => {
  const isDev = process.env.ISDEV;
  afterEach(() => {
    process.env.ISDEV = isDev;
    jest.restoreAllMocks();
  });

  function capture(method: 'log' | 'warn' | 'error' | 'debug') {
    const spy = jest.spyOn(ConsoleLogger.prototype, method).mockImplementation(() => undefined);
    return () => spy.mock.calls.map((call: unknown[]) => String(call[0]));
  }

  it('redacts credential fields by key and keeps harmless token counters', () => {
    process.env.ISDEV = 'false';
    const logged = capture('log');
    new CustomLoggerService().log({
      user: { name: 'alice', password: 'hunter2-secret' },
      headers: { Authorization: 'Bearer abcdefghijklmnop', 'x-api-key': 'k-123456' },
      accessToken: 'at-123456789',
      usage: { usedTokens: 42, tokenCount: 7 },
    });
    const [text] = logged();
    for (const secret of ['hunter2-secret', 'abcdefghijklmnop', 'k-123456', 'at-123456789']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('alice');
    expect(text).toContain('usedTokens: 42');
    expect(text).toContain('tokenCount: 7');
  });

  it('redacts credentials inside plain strings and error traces', () => {
    const logged = capture('error');
    new CustomLoggerService().error(
      'request failed: https://api.example.com/token?appid=a&secret=S3CR3T&x=1 Bearer ZXhhbXBsZXRva2Vu',
      'Error: at fetch (https://api.example.com/?token=T0K3N)',
      'Demo',
    );
    const call = (ConsoleLogger.prototype.error as any).mock.calls[0];
    expect(logged()[0]).not.toContain('S3CR3T');
    expect(logged()[0]).not.toContain('ZXhhbXBsZXRva2Vu');
    expect(logged()[0]).toContain('appid=a');
    expect(call[1]).not.toContain('T0K3N');
    expect(call[2]).toBe('Demo');
  });

  it('bounds depth and size and survives cycles', () => {
    const logged = capture('log');
    const cyclic: any = { level1: { level2: { level3: { level4: { level5: 'deep' } } } } };
    cyclic.self = cyclic;
    new CustomLoggerService().log({ cyclic, list: Array.from({ length: 500 }, (_, i) => i) });
    const [text] = logged();
    expect(text).toContain('[Circular]');
    expect(text).not.toContain('deep');
    expect(text).not.toContain('499');
    expect(text).not.toBe('[无法序列化的对象]');
  });

  it('passes the caller arguments through unchanged', () => {
    capture('error');
    const logger = new CustomLoggerService();
    logger.error('只带上下文', 'Demo');
    logger.error('带堆栈', 'Error: boom\n    at x (file.ts:1:1)', 'Demo');
    const calls = (ConsoleLogger.prototype.error as any).mock.calls;
    expect(calls[0]).toEqual(['只带上下文', 'Demo']);
    expect(calls[1]).toEqual(['带堆栈', 'Error: boom\n    at x (file.ts:1:1)', 'Demo']);
  });

  it('writes warnings in production and keeps debug output for development only', () => {
    process.env.ISDEV = 'false';
    const warned = capture('warn');
    const debugged = capture('debug');
    const logger = new CustomLoggerService();
    logger.warn('沙箱发现配置不匹配', 'Sandbox');
    logger.debug('细节', 'Sandbox');
    expect(warned()).toEqual(['沙箱发现配置不匹配']);
    expect(debugged()).toEqual([]);
  });

  it('keeps credentials out of the final production output, including extra params', () => {
    process.env.ISDEV = 'false';
    const written: string[] = [];
    const record = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    jest.spyOn(process.stdout, 'write').mockImplementation(record);
    jest.spyOn(process.stderr, 'write').mockImplementation(record);
    const logger = new CustomLoggerService();

    logger.warn(
      '异常: client_secret=CS-111 secretKey=SK-222 body={"password": "PW-333", "user": "alice"}',
      { apiKey: 'AK-444', nested: { stripeSecretKey: 'SK-555' }, count: 3 },
      'AllExceptionsFilter',
    );
    logger.warn(
      `异常: client_secret="CS-888" secretKey='SK-999' x-api-key: AK-000 {'password': 'PW-121'}`,
      'AllExceptionsFilter',
    );
    logger.warn(
      String.raw`异常: password="PW-A\"PW-B" secret='SC-A\'SC-B' {"token": "TK-A\"TK-B"}`,
      'AllExceptionsFilter',
    );
    // 缺结束引号的值替换到行尾，下一行照常输出
    logger.warn(
      '异常: password="PW-U1 请求 Bearer ab1\n下一行 secret=\'SC-U2',
      'AllExceptionsFilter',
    );
    logger.warn('{"token":"TK-U3', 'AllExceptionsFilter');
    // 以孤立反斜杠结尾的未闭合值，以及认证方案后紧跟换行时，都不能跨行吞掉下一行
    logger.warn('异常: password="PW-L1\\', 'AllExceptionsFilter');
    logger.warn("异常: secret='SC-L2\\\n下一行保留", 'AllExceptionsFilter');
    logger.warn('{"token":"TK-L3\\', 'AllExceptionsFilter');
    logger.warn('异常: password="PW-L4 Bearer\n第二行保留', 'AllExceptionsFilter');
    // 引号值遇到任何行分隔符（CR、LF、U+2028、U+2029）都停下，后面的行照常输出
    logger.warn('异常: password="PW-R1\r下一行R', 'AllExceptionsFilter');
    logger.warn('{"token":"TK-R2\u2028下一行U', 'AllExceptionsFilter');
    logger.warn("异常: secret='SC-R3\u2029下一行P", 'AllExceptionsFilter');
    logger.log('配置已加载', { tencentSecretKey: 'SK-666', region: 'ap-guangzhou' }, 'Config');
    logger.error('请求失败', new Error('upstream said access_token=AT-777'), 'Wechat');

    const output = written.join('');
    for (const secret of [
      'CS-111',
      'SK-222',
      'PW-333',
      'AK-444',
      'SK-555',
      'SK-666',
      'AT-777',
      'CS-888',
      'SK-999',
      'AK-000',
      'PW-121',
      'PW-B',
      'SC-B',
      'TK-B',
      'PW-U1',
      'SC-U2',
      'TK-U3',
      'ab1',
      'PW-L1',
      'SC-L2',
      'TK-L3',
      'PW-L4',
      'PW-R1',
      'TK-R2',
      'SC-R3',
    ]) {
      expect(output).not.toContain(secret);
    }
    for (const kept of [
      'alice',
      'count',
      'ap-guangzhou',
      'AllExceptionsFilter',
      'Config',
      'Wechat',
      '下一行',
      '下一行保留',
      '第二行保留',
      '下一行R',
      '下一行U',
      '下一行P',
    ]) {
      expect(output).toContain(kept);
    }
  });

  it('replaces an authorization header value with a single marker', () => {
    const logged = capture('log');
    const logger = new CustomLoggerService();
    logger.log('Authorization: Bearer abcdefghijkl');
    logger.log('authorization=Basic abc');
    logger.log('upstream sent Bearer abc');
    expect(logged()).toEqual([
      'Authorization: [已脱敏]',
      'authorization=[已脱敏]',
      'upstream sent Bearer [已脱敏]',
    ]);
  });

  it('scans long ordinary keys and long unclosed values in linear time', () => {
    const logged = capture('log');
    const logger = new CustomLoggerService();
    const startedAt = Date.now();
    logger.log(`${'a_'.repeat(50_000)}a=v token=T-1`);
    // 用不会被 Base64 过滤截短的字符，确保正则真的扫了全文
    logger.log(`password="${'a-'.repeat(100_000)}\\`);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(logged()[0].endsWith('a=v token=[已脱敏]')).toBe(true);
    expect(logged()[1]).toBe('password="[已脱敏]"');
  });

  it('leaves ordinary key=value text, headers, URLs and JSON fields alone', () => {
    const logged = capture('log');
    const text =
      'fileId=file_1 max_tokens=100 objectKey=public/a.png messageKey: chat.done ' +
      'https://a.com/x 12:30 {"messageKey": "chat.done", "usedTokens": "42"}';
    new CustomLoggerService().log(text);
    expect(logged()[0]).toBe(text);
  });
});
