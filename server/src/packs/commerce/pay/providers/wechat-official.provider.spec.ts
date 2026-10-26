import { Logger } from '@nestjs/common';
import { createSign, generateKeyPairSync } from 'crypto';
import { WechatOfficialProvider } from './wechat-official.provider';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

function signWechatBody(privateKey: string, timestamp: string, nonce: string, rawBody: Buffer) {
  const signer = createSign('RSA-SHA256');
  signer.update(`${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

describe('WechatOfficialProvider notify signature verification', () => {
  let globalConfigService: any;
  let userService: any;
  let getPaymentUrls: any;
  let decipherGcm: any;
  let provider: WechatOfficialProvider;
  let publicKey: string;
  let privateKey: string;
  let loggerErrorSpy: any;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue({
        payWeChatAppId: 'wx_app_001',
        payWeChatMchId: 'mch_001',
        payWeChatSecret: 'api_v3_secret_32_bytes_value_001',
        payWeChatPublicKey: publicKey,
        payWeChatPlatformSerialNo: 'SERIAL_001',
        payWeChatPrivateKey: 'merchant-private-key',
      }),
    };
    userService = {};
    getPaymentUrls = jest.fn();
    decipherGcm = jest.fn().mockReturnValue({
      mchid: 'mch_001',
      appid: 'wx_app_001',
      trade_state: 'SUCCESS',
      amount: { total: 1299 },
      out_trade_no: 'ORDER_001',
      transaction_id: 'WX_TRADE_001',
    });

    const WxPayMock = jest.fn().mockImplementation(() => ({
      decipher_gcm: decipherGcm,
    }));
    provider = new WechatOfficialProvider(
      globalConfigService,
      userService,
      getPaymentUrls,
      WxPayMock,
    );
  });

  afterEach(() => {
    loggerErrorSpy?.mockRestore();
  });

  it('rejects WeChat notify payloads before decrypting when signature headers are missing', async () => {
    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {},
        rawBody: Buffer.from(JSON.stringify(rawParams)),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        responseText: 'failed',
      }),
    );
    expect(decipherGcm).not.toHaveBeenCalled();
  });

  it('rejects WeChat notify payloads before decrypting when the signature is invalid', async () => {
    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'wechatpay-timestamp': '1778100000',
          'wechatpay-nonce': 'nonce_001',
          'wechatpay-signature': 'bad-signature',
          'wechatpay-serial': 'SERIAL_001',
        },
        rawBody: Buffer.from(JSON.stringify(rawParams)),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        responseText: 'failed',
      }),
    );
    expect(decipherGcm).not.toHaveBeenCalled();
  });

  it('decrypts and returns a paid result only after WeChat HTTP signature verification passes', async () => {
    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };
    const rawBody = Buffer.from(JSON.stringify(rawParams));
    const timestamp = '1778100000';
    const nonce = 'nonce_001';
    const signature = signWechatBody(privateKey, timestamp, nonce, rawBody);

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': signature,
          'Wechatpay-Serial': 'SERIAL_001',
        },
        rawBody,
      }),
    ).resolves.toEqual({
      success: true,
      status: 'paid',
      orderId: 'ORDER_001',
      tradeId: 'WX_TRADE_001',
      amount: '12.99',
      currency: 'CNY',
      responseText: 'success',
    });
    expect(decipherGcm).toHaveBeenCalledWith(
      'ciphertext',
      'associated',
      'nonce',
      'api_v3_secret_32_bytes_value_001',
    );
  });

  it('verifies WeChat notify signatures with configured WeChat Pay public key mode', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatSecret: 'api_v3_secret_32_bytes_value_001',
      payWeChatVerifyMode: 'wechatpay_public_key',
      payWeChatPublicKey: '',
      payWeChatPlatformSerialNo: '',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: publicKey,
      payWeChatPrivateKey: 'merchant-private-key',
    });

    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };
    const rawBody = Buffer.from(JSON.stringify(rawParams));
    const timestamp = '1778100000';
    const nonce = 'nonce_001';
    const signature = signWechatBody(privateKey, timestamp, nonce, rawBody);

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': signature,
          'Wechatpay-Serial': 'PUB_KEY_ID_001',
        },
        rawBody,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: 'paid',
        orderId: 'ORDER_001',
      }),
    );
    expect(decipherGcm).toHaveBeenCalled();
  });

  it('rejects WeChat Pay public key mode callbacks when the public key id mismatches', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatSecret: 'api_v3_secret_32_bytes_value_001',
      payWeChatVerifyMode: 'wechatpay_public_key',
      payWeChatPublicKey: '',
      payWeChatPlatformSerialNo: '',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: publicKey,
      payWeChatPrivateKey: 'merchant-private-key',
    });

    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };
    const rawBody = Buffer.from(JSON.stringify(rawParams));
    const timestamp = '1778100000';
    const nonce = 'nonce_001';
    const signature = signWechatBody(privateKey, timestamp, nonce, rawBody);

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': signature,
          'Wechatpay-Serial': 'PUB_KEY_ID_OTHER',
        },
        rawBody,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        responseText: 'failed',
      }),
    );
    expect(decipherGcm).not.toHaveBeenCalled();
  });

  it('auto-selects the platform certificate material during WeChat verification migration', async () => {
    const wechatpayKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const wechatpayPublicKey = wechatpayKeyPair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();

    globalConfigService.getConfigs.mockResolvedValue({
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatSecret: 'api_v3_secret_32_bytes_value_001',
      payWeChatVerifyMode: 'auto_compat',
      payWeChatPublicKey: publicKey,
      payWeChatPlatformSerialNo: 'SERIAL_001',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: wechatpayPublicKey,
      payWeChatPrivateKey: 'merchant-private-key',
    });

    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };
    const rawBody = Buffer.from(JSON.stringify(rawParams));
    const timestamp = '1778100000';
    const nonce = 'nonce_001';
    const signature = signWechatBody(privateKey, timestamp, nonce, rawBody);

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': signature,
          'Wechatpay-Serial': 'SERIAL_001',
        },
        rawBody,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: 'paid',
        orderId: 'ORDER_001',
      }),
    );
    expect(decipherGcm).toHaveBeenCalled();
  });

  it('auto-selects the WeChat Pay public key material during verification migration', async () => {
    const platformKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const platformPublicKey = platformKeyPair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();

    globalConfigService.getConfigs.mockResolvedValue({
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatSecret: 'api_v3_secret_32_bytes_value_001',
      payWeChatVerifyMode: 'auto_compat',
      payWeChatPublicKey: platformPublicKey,
      payWeChatPlatformSerialNo: 'SERIAL_001',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: publicKey,
      payWeChatPrivateKey: 'merchant-private-key',
    });

    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };
    const rawBody = Buffer.from(JSON.stringify(rawParams));
    const timestamp = '1778100000';
    const nonce = 'nonce_001';
    const signature = signWechatBody(privateKey, timestamp, nonce, rawBody);

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': signature,
          'Wechatpay-Serial': 'PUB_KEY_ID_001',
        },
        rawBody,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: 'paid',
        orderId: 'ORDER_001',
      }),
    );
    expect(decipherGcm).toHaveBeenCalled();
  });

  it('rejects auto compatibility callbacks when Wechatpay-Serial is unknown', async () => {
    globalConfigService.getConfigs.mockResolvedValue({
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatSecret: 'api_v3_secret_32_bytes_value_001',
      payWeChatVerifyMode: 'auto_compat',
      payWeChatPublicKey: publicKey,
      payWeChatPlatformSerialNo: 'SERIAL_001',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: publicKey,
      payWeChatPrivateKey: 'merchant-private-key',
    });

    const rawParams = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'ciphertext', associated_data: 'associated', nonce: 'nonce' },
    };
    const rawBody = Buffer.from(JSON.stringify(rawParams));
    const timestamp = '1778100000';
    const nonce = 'nonce_001';
    const signature = signWechatBody(privateKey, timestamp, nonce, rawBody);

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {
          'Wechatpay-Timestamp': timestamp,
          'Wechatpay-Nonce': nonce,
          'Wechatpay-Signature': signature,
          'Wechatpay-Serial': 'UNKNOWN_SERIAL',
        },
        rawBody,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        responseText: 'failed',
      }),
    );
    expect(decipherGcm).not.toHaveBeenCalled();
  });

  it('verifies WeChat signatures before ignoring non-success events', async () => {
    const rawParams = { event_type: 'REFUND.SUCCESS' };

    await expect(
      provider.parseNotify({
        rawParams,
        headers: {},
        rawBody: Buffer.from(JSON.stringify(rawParams)),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        responseText: 'failed',
      }),
    );
    expect(decipherGcm).not.toHaveBeenCalled();
  });
});

describe('WechatOfficialProvider SDK query envelope', () => {
  const orderId = 'QUERY_FIXTURE_ORDER';
  const success = () => ({
    appid: 'fixture-app',
    mchid: 'fixture-merchant',
    out_trade_no: orderId,
    trade_state: 'SUCCESS',
    transaction_id: 'fixture-transaction',
    amount: { total: 1299, payer_total: 999, currency: 'CNY', payer_currency: 'CNY' },
  });
  function fixture(response: unknown) {
    const query = jest.fn().mockResolvedValue(response);
    const createHttp = jest.fn();
    const queryHttp = { get: jest.fn() };
    const config = { payWeChatAppId: 'fixture-app', payWeChatMchId: 'fixture-merchant' };
    const provider = new WechatOfficialProvider(
      { getConfigs: jest.fn().mockResolvedValue(config) } as any,
      {} as any,
      jest.fn(),
      jest.fn().mockImplementation(() => ({ query, createHttp })),
      () => queryHttp as any,
    );
    return { provider, query, createHttp, queryHttp };
  }

  it('reads the real SDK envelope and uses total before discounts with the requested order', async () => {
    const { provider, query } = fixture({
      status: 200,
      data: success(),
      trade_state: 'NOTPAY',
      amount: { total: 1 },
    });
    await expect(provider.queryOrder({ orderId })).resolves.toEqual({
      state: 'paid',
      orderId,
      tradeId: 'fixture-transaction',
      amount: '12.99',
      currency: 'CNY',
    });
    expect(query).toHaveBeenCalledWith({ out_trade_no: orderId });
  });

  it('installs the deadline-bound request only on the query instance, before querying', async () => {
    const { provider, query, createHttp, queryHttp } = fixture({ status: 200, data: success() });
    await provider.queryOrder({ orderId });
    expect(createHttp).toHaveBeenCalledWith(queryHttp);
    expect(createHttp.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[0]);
  });

  it.each([
    ['NOTPAY', 'pending'],
    ['USERPAYING', 'pending'],
    ['CLOSED', 'closed'],
    ['REVOKED', 'closed'],
    ['PAYERROR', 'unknown'],
    ['REFUND', 'unknown'],
  ])(
    'maps a matching %s order to %s without settling it',
    async (trade_state: string, state: string) => {
      const { provider } = fixture({ status: 200, data: { ...success(), trade_state } });
      await expect(provider.queryOrder({ orderId })).resolves.toEqual({ state, orderId });
    },
  );

  it('treats only the explicit ORDER_NOT_EXIST 404 as still pending', async () => {
    const { provider } = fixture({ status: 404, error: '{"code":"ORDER_NOT_EXIST"}' });
    await expect(provider.queryOrder({ orderId })).resolves.toEqual({ state: 'pending', orderId });
  });

  it.each([
    ['legacy top-level payload', { status: 200, ...success() }],
    ['missing data', { status: 200 }],
    ['conflicting error', { status: 200, data: success(), error: 'synthetic error' }],
    ['array data', { status: 200, data: [] }],
    ['malformed 404', { status: 404, error: 'not JSON' }],
    ['unknown 404', { status: 404, error: '{"code":"UNKNOWN_ERROR"}' }],
    ['401', { status: 401, data: success() }],
    ['429', { status: 429, data: success() }],
    ['500', { status: 500, data: success() }],
    ['null', null],
  ])(
    'rejects %s without propagating response details',
    async (_name: string, response: unknown) => {
      const { provider } = fixture(response);
      await expect(provider.queryOrder({ orderId })).rejects.toThrow('微信支付查单失败');
    },
  );

  it.each([
    ['wrong order', { out_trade_no: 'another-order' }],
    ['missing order', { out_trade_no: undefined }],
    ['wrong merchant', { mchid: 'another-merchant' }],
    ['missing merchant', { mchid: undefined }],
    ['wrong app', { appid: 'another-app' }],
    ['missing app', { appid: undefined }],
    ['unknown state', { trade_state: 'UNKNOWN' }],
    ['missing state', { trade_state: undefined }],
    ['missing transaction', { transaction_id: undefined }],
    ['empty transaction', { transaction_id: '' }],
    ['transaction with whitespace', { transaction_id: 'bad transaction' }],
    ['transaction with control character', { transaction_id: 'bad\u0000transaction' }],
    ['oversized transaction', { transaction_id: 'x'.repeat(33) }],
    ['missing amount', { amount: undefined }],
    ...[0, -1, 1.5, '1299', NaN, Number.MAX_SAFE_INTEGER + 1].map(total => [
      `invalid total ${String(total)}`,
      { amount: { total, currency: 'CNY' } },
    ]),
    ['missing currency', { amount: { total: 1299 } }],
    ['wrong currency', { amount: { total: 1299, currency: 'USD' } }],
    ['wrong payer currency', { amount: { total: 1299, currency: 'CNY', payer_currency: 'USD' } }],
  ])('rejects SUCCESS with %s', async (_name: string, overrides: Record<string, unknown>) => {
    const { provider } = fixture({ status: 200, data: { ...success(), ...overrides } });
    await expect(provider.queryOrder({ orderId })).rejects.toThrow('微信支付查单失败');
  });

  it('replaces SDK exceptions with a static error', async () => {
    const { provider, query } = fixture(undefined);
    query.mockRejectedValue(new Error('synthetic upstream diagnostic'));
    await expect(provider.queryOrder({ orderId })).rejects.toThrow('微信支付查单失败');
  });
});
