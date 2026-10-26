import { Logger } from '@nestjs/common';
import { createGlobalConfigFake } from '../../test/global-config.fake';
import { AlipayService } from './alipay.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

// 替身 SDK：记下每次按哪份配置构造，验签恒为通过，下单抛出带细节的错误（检查日志不带细节）
jest.mock('alipay-sdk', () => ({
  AlipaySdk: jest.fn().mockImplementation((options: any) => ({
    options,
    checkNotifySign: jest.fn(() => true),
    pageExec: jest.fn(() => {
      throw new Error('gateway-detail-should-not-be-logged');
    }),
  })),
}));

describe('AlipayService.verifyNotify', () => {
  let config: ReturnType<typeof createGlobalConfigFake>;
  let service: AlipayService;
  const notify = { app_id: 'APP_A', out_trade_no: 'ORDER_1', trade_status: 'TRADE_SUCCESS' };

  beforeEach(() => {
    config = createGlobalConfigFake(jest.fn, {
      alipayAppId: 'APP_A',
      alipayPrivateKey: 'private-a',
      alipayPublicKey: 'public-a',
    });
    service = new AlipayService(config as any);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** 替身 SDK：记下是按哪份配置建的，验签结果由用例决定 */
  function stubSdk(valid = true) {
    const built: string[] = [];
    (service as any).sdkFor = jest.fn((snapshot: any) => {
      built.push(snapshot.appId);
      return { checkNotifySign: jest.fn(() => valid) };
    });
    return built;
  }

  it('verifies the signature and the app_id against one config snapshot read once', async () => {
    const built = stubSdk(true);
    // 验签与 App ID 核对之间改配置：同一次通知仍按开始时读到的那一份判定
    config.getConfigs.mockImplementationOnce(async (keys: string[]) => {
      const snapshot = Object.fromEntries(keys.map(key => [key, config.values[key]]));
      config.values.alipayAppId = 'APP_B';
      return snapshot;
    });

    await expect(service.verifyNotify(notify)).resolves.toBe('ok');
    expect(config.getConfigs).toHaveBeenCalledTimes(1);
    expect(built).toEqual(['APP_A']);
  });

  it('rejects a bad signature, a mismatched app_id and an incomplete config', async () => {
    stubSdk(false);
    await expect(service.verifyNotify(notify)).resolves.toBe('bad_sign');

    stubSdk(true);
    await expect(service.verifyNotify({ ...notify, app_id: 'OTHER' })).resolves.toBe(
      'app_id_mismatch',
    );

    config.values.alipayPublicKey = '';
    await expect(service.verifyNotify(notify)).resolves.toBe('bad_sign');
  });

  it('rebuilds the SDK through real config reads when any of the three settings changes', async () => {
    const { AlipaySdk } = require('alipay-sdk');
    AlipaySdk.mockClear();
    const builtWith = () =>
      AlipaySdk.mock.calls.map(([options]: any[]) =>
        [options.appId, options.privateKey, options.alipayPublicKey].join('|'),
      );

    await expect(service.verifyNotify(notify)).resolves.toBe('ok');
    await expect(service.verifyNotify(notify)).resolves.toBe('ok');
    expect(builtWith()).toEqual(['APP_A|private-a|public-a']);

    config.values.alipayPrivateKey = 'private-b';
    await service.verifyNotify(notify);
    config.values.alipayPublicKey = 'public-b';
    await service.verifyNotify(notify);
    config.values.alipayAppId = 'APP_B';
    await expect(service.verifyNotify({ ...notify, app_id: 'APP_B' })).resolves.toBe('ok');
    await service.verifyNotify({ ...notify, app_id: 'APP_B' });

    expect(builtWith()).toEqual([
      'APP_A|private-a|public-a',
      'APP_A|private-b|public-a',
      'APP_A|private-b|public-b',
      'APP_B|private-b|public-b',
    ]);
  });

  it('logs static messages when creating a payment fails', async () => {
    config.values.siteUrl = 'https://example.com';
    const logged = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

    await expect(service.createPagePay('ORDER_1', 10, 'Plan', '')).rejects.toThrow(
      '支付宝支付创建失败',
    );
    await expect(service.createWapPay('ORDER_1', 10, 'Plan', '')).rejects.toThrow(
      '支付宝支付创建失败',
    );

    expect(logged.mock.calls.map((call: any[]) => [call[0], call[2]])).toEqual([
      ['支付宝电脑网站支付创建失败', 'AlipayService'],
      ['支付宝手机网站支付创建失败', 'AlipayService'],
    ]);
    expect(JSON.stringify(logged.mock.calls.map((call: any[]) => call[0]))).not.toContain(
      'gateway-detail',
    );
  });
});

describe('AlipayService.queryOrder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checks the response signature and gives each request at most 10 seconds', async () => {
    const service = new AlipayService(
      createGlobalConfigFake(jest.fn, {
        alipayAppId: 'APP_A',
        alipayPrivateKey: 'private-a',
        alipayPublicKey: 'public-a',
      }) as any,
    );
    const exec = jest.fn().mockResolvedValue({ code: '10000', outTradeNo: 'ORDER_1' });
    const realSdkFor = (service as any).sdkFor.bind(service);
    let built: any;
    (service as any).sdkFor = jest.fn((snapshot: any) => {
      built = realSdkFor(snapshot);
      built.exec = exec;
      return built;
    });

    await expect(service.queryOrder('ORDER_1')).resolves.toEqual({
      code: '10000',
      outTradeNo: 'ORDER_1',
    });
    expect(built.options).toMatchObject({ timeout: 10000, alipayPublicKey: 'public-a' });
    expect(exec).toHaveBeenCalledWith(
      'alipay.trade.query',
      { bizContent: { out_trade_no: 'ORDER_1' } },
      { validateSign: true },
    );
  });

  /** SDK 的验签失败异常把签名与完整响应（订单号、买家账号）写在消息里：日志只能有静态文案与错误类型 */
  const signatureFailure = () => {
    const error = new Error(
      '验签失败，服务端返回的 sign: \'SIGN_MARKER\' 无效, validateStr: \'{"out_trade_no":"ORDER_1","buyer_logon_id":"BUYER_MARKER"}\'',
    );
    error.name = 'AlipayRequestError';
    return error;
  };

  it.each([
    ['a failed response signature check', signatureFailure, 'type=request'],
    ['any other failure', () => new Error('socket hang up near BUYER_MARKER'), 'type=other'],
  ])(
    'logs only a static message and the error kind for %s',
    async (_name: string, makeError: () => Error, kind: string) => {
      const service = new AlipayService(
        createGlobalConfigFake(jest.fn, {
          alipayAppId: 'APP_A',
          alipayPrivateKey: 'private-a',
          alipayPublicKey: 'public-a',
        }) as any,
      );
      (service as any).sdkFor = jest.fn(() => ({
        exec: jest.fn().mockRejectedValue(makeError()),
      }));
      const logged = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);

      await expect(service.queryOrder('ORDER_1')).rejects.toThrow('订单查询失败');

      expect(logged.mock.calls).toEqual([['支付宝订单查询失败', kind, 'AlipayService']]);
      expect(JSON.stringify(logged.mock.calls)).not.toMatch(/MARKER|ORDER_1|validateStr/);
    },
  );
});
