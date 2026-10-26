import { VerificationCodeService } from './verification-code.service';
import {
  ISSUE_CODE_SCRIPT,
  VERIFY_CODE_SCRIPT,
  DISCARD_CODE_SCRIPT,
} from './verification-code.scripts';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('VerificationCodeService', () => {
  let store: Map<string, string>;
  let counters: Map<string, number>;
  let ttls: Map<string, number>;
  let service: VerificationCodeService;

  beforeEach(() => {
    store = new Map();
    counters = new Map();
    ttls = new Map();
    const redis = {
      get: jest.fn(async ({ key }: any) => store.get(key) ?? null),
      // Redis 脚本的原子命令边界；此 fake 不代替真实 Redis 的 Lua 集成验收。
      runAtomicScript: jest.fn(async (script: string, keys: string[], args: string[]) => {
        const [codeKey, resendKey, failKey] = keys;
        const remove = (key: string) => {
          store.delete(key);
          counters.delete(key);
          ttls.delete(key);
        };
        if (script === ISSUE_CODE_SCRIPT) {
          if (store.has(resendKey)) return Math.max(1, ttls.get(resendKey) ?? -1);
          store.set(codeKey, args[0]);
          store.set(resendKey, args[1]);
          ttls.set(codeKey, Number(args[2]));
          ttls.set(resendKey, Number(args[3]));
          remove(failKey);
          return 0;
        }
        if (script === VERIFY_CODE_SCRIPT) {
          if (store.get(codeKey) !== args[0]) return -1;
          if (args[1] === '1') {
            remove(codeKey);
            remove(failKey);
            return 0;
          }
          const failed = (counters.get(failKey) ?? 0) + 1;
          counters.set(failKey, failed);
          if (failed >= Number(args[3])) {
            remove(codeKey);
            remove(failKey);
          }
          return failed;
        }
        if (script === DISCARD_CODE_SCRIPT) {
          const saved = store.get(codeKey);
          if (saved && JSON.parse(saved).requestId === args[0]) {
            remove(codeKey);
            remove(failKey);
          }
          if (store.get(resendKey) === args[0]) remove(resendKey);
          return 0;
        }
        throw new Error('Unexpected atomic operation');
      }),
    };
    const globalConfig = { getNamespace: () => 'AIWeb' };
    service = new VerificationCodeService(redis as any, globalConfig as any);
  });

  it('issues a six-digit code, blocks resend within the interval and verifies once', async () => {
    const { code } = await service.issue('login', 'user@example.com');

    expect(code).toMatch(/^\d{6}$/);
    expect(ttls.get('AIWeb:authCode:login:user@example.com')).toBe(600);
    await expect(service.issue('login', 'user@example.com')).rejects.toThrow('秒内不得重复发送');

    await service.verify('login', 'user@example.com', code);
    await expect(service.verify('login', 'user@example.com', code)).rejects.toThrow(
      '验证码不存在或已过期',
    );
  });

  it('keeps scenes apart so a login code cannot reset a password', async () => {
    const { code } = await service.issue('login', '13800138000');

    await expect(service.verify('reset', '13800138000', code)).rejects.toThrow(
      '验证码不存在或已过期',
    );
    await expect(service.verify('login', '13800138000', code)).resolves.toBeUndefined();
  });

  it('invalidates the code after five wrong attempts', async () => {
    const { code } = await service.issue('bind', 'user@example.com');
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 1; i < 5; i += 1) {
      await expect(service.verify('bind', 'user@example.com', wrong)).rejects.toThrow(
        `还可尝试${5 - i}次`,
      );
    }
    await expect(service.verify('bind', 'user@example.com', wrong)).rejects.toThrow(
      '验证码错误次数过多',
    );
    expect(store.has('AIWeb:authCode:bind:user@example.com')).toBe(false);
  });

  it('discard() removes the code and the resend guard after a delivery failure', async () => {
    const { requestId } = await service.issue('login', 'user@example.com');
    await service.discard('login', 'user@example.com', requestId);

    await expect(service.issue('login', 'user@example.com')).resolves.toEqual(
      expect.objectContaining({ code: expect.stringMatching(/^\d{6}$/) }),
    );
  });

  it('allows only one concurrent issue for the same contact and scene', async () => {
    const results = await Promise.allSettled([
      service.issue('login', 'parallel@example.invalid'),
      service.issue('login', 'parallel@example.invalid'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('consumes the same correct code at most once across concurrent requests', async () => {
    const { code } = await service.issue('login', 'parallel@example.invalid');
    const results = await Promise.allSettled([
      service.verify('login', 'parallel@example.invalid', code),
      service.verify('login', 'parallel@example.invalid', code),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('does not let a late delivery failure discard a newer generation', async () => {
    const first = await service.issue('login', 'generation@example.invalid');
    store.delete('AIWeb:authCode:login:generation@example.invalid:sent');
    const second = await service.issue('login', 'generation@example.invalid');
    await service.discard('login', 'generation@example.invalid', first.requestId);
    await expect(service.issue('login', 'generation@example.invalid')).rejects.toThrow(
      '秒内不得重复发送',
    );
    await expect(
      service.verify('login', 'generation@example.invalid', second.code),
    ).resolves.toBeUndefined();
  });

  it('counts concurrent wrong attempts without allowing more than one successful consumption', async () => {
    const { code } = await service.issue('login', 'attempts@example.invalid');
    const wrong = code === '000000' ? '111111' : '000000';
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.verify('login', 'attempts@example.invalid', wrong)),
    );
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    await expect(service.verify('login', 'attempts@example.invalid', code)).rejects.toThrow(
      '不存在或已过期',
    );
  });
});
