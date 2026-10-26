import { Logger } from '@nestjs/common';
import axios from 'axios';
import { createGlobalConfigFake } from '../../test/global-config.fake';
import { PayPalService } from './paypal.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios');

const LIVE = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

describe('PayPalService', () => {
  const mockedAxios = axios as any;
  let config: ReturnType<typeof createGlobalConfigFake>;
  let service: PayPalService;
  let tokenSeq: number;

  beforeEach(() => {
    tokenSeq = 0;
    config = createGlobalConfigFake(jest.fn, {
      payPalClientId: 'client-a',
      payPalClientSecret: 'secret-a',
      payPalMode: 'live',
      payPalWebhookId: 'WH-1',
      siteUrl: 'https://example.com',
      siteName: 'Demo',
    });
    service = new PayPalService(config as any);
    mockedAxios.post = jest.fn(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        tokenSeq += 1;
        return { data: { access_token: `token-${tokenSeq}`, expires_in: 32400 } };
      }
      if (url.endsWith('/v2/checkout/orders')) {
        return { data: { id: 'PAYPAL1', status: 'CREATED', links: [] } };
      }
      if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
        return { data: { verification_status: 'SUCCESS' } };
      }
      throw new Error(`unexpected ${url}`);
    });
    jest.spyOn(Logger, 'log').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'debug').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const calls = () => mockedAxios.post.mock.calls.map((call: any[]) => call[0]);
  const authOf = (url: string) =>
    mockedAxios.post.mock.calls.find((call: any[]) => call[0] === url)?.[2]?.headers?.Authorization;

  it('uses the live API when payPalMode is live, with the token fetched for the same config', async () => {
    await service.createOrder('10.00', 'ORDER_1');

    expect(calls()).toEqual([`${LIVE}/v1/oauth2/token`, `${LIVE}/v2/checkout/orders`]);
    expect(authOf(`${LIVE}/v2/checkout/orders`)).toBe('Bearer token-1');
  });

  it('reuses the token while the config is unchanged and refetches after mode, client or secret changes', async () => {
    await service.createOrder('10.00', 'ORDER_1');
    await service.createOrder('10.00', 'ORDER_2');
    expect(calls().filter((url: string) => url.endsWith('/oauth2/token'))).toHaveLength(1);

    config.values.payPalMode = 'sandbox';
    await service.createOrder('10.00', 'ORDER_3');
    expect(calls().at(-2)).toBe(`${SANDBOX}/v1/oauth2/token`);
    expect(calls().at(-1)).toBe(`${SANDBOX}/v2/checkout/orders`);

    config.values.payPalClientId = 'client-b';
    await service.createOrder('10.00', 'ORDER_4');
    config.values.payPalClientSecret = 'secret-b';
    await service.createOrder('10.00', 'ORDER_5');
    expect(calls().filter((url: string) => url.endsWith('/oauth2/token'))).toHaveLength(4);
  });

  it('keeps each operation on its own config when token responses arrive out of order', async () => {
    const pending: Array<{ url: string; resolve: (value: any) => void }> = [];
    mockedAxios.post = jest.fn((url: string, _body: any, options: any) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return new Promise(resolve => pending.push({ url, resolve }));
      }
      return Promise.resolve({
        data: { id: 'PAYPAL', links: [], auth: options.headers.Authorization },
      });
    });

    const first = service.createOrder('10.00', 'ORDER_A');
    await new Promise(resolve => setImmediate(resolve));
    config.values.payPalMode = 'sandbox';
    const second = service.createOrder('10.00', 'ORDER_B');
    await new Promise(resolve => setImmediate(resolve));

    expect(pending.map(item => item.url)).toEqual([
      `${LIVE}/v1/oauth2/token`,
      `${SANDBOX}/v1/oauth2/token`,
    ]);
    pending[1].resolve({ data: { access_token: 'sandbox-token', expires_in: 32400 } });
    pending[0].resolve({ data: { access_token: 'live-token', expires_in: 32400 } });
    await Promise.all([first, second]);

    const orderCalls = mockedAxios.post.mock.calls.filter((call: any[]) =>
      call[0].endsWith('/v2/checkout/orders'),
    );
    expect(orderCalls.map((call: any[]) => [call[0], call[2].headers.Authorization])).toEqual(
      expect.arrayContaining([
        [`${LIVE}/v2/checkout/orders`, 'Bearer live-token'],
        [`${SANDBOX}/v2/checkout/orders`, 'Bearer sandbox-token'],
      ]),
    );
  });

  it('refuses once the client id or secret is cleared, even with a cached token', async () => {
    mockedAxios.get = jest.fn(async () => ({ data: { id: 'PAYPAL1', status: 'APPROVED' } }));
    await service.createOrder('10.00', 'ORDER_1');
    await service.queryOrder('PAYPAL1');
    const posts = mockedAxios.post.mock.calls.length;
    const gets = mockedAxios.get.mock.calls.length;

    for (const [key, blank] of [
      ['payPalClientSecret', ''],
      ['payPalClientId', '  '],
    ]) {
      const kept = config.values[key];
      config.values[key] = blank;
      await expect(service.createOrder('10.00', 'ORDER_2')).rejects.toThrow('PayPal配置信息不完整');
      await expect(service.queryOrder('PAYPAL1')).rejects.toThrow('PayPal配置信息不完整');
      config.values[key] = kept;
    }
    expect(mockedAxios.post.mock.calls.length).toBe(posts);
    expect(mockedAxios.get.mock.calls.length).toBe(gets);
  });

  it('logs a failed token request with the error stack and a static message', async () => {
    const logged = Logger.error as any;
    mockedAxios.post = jest.fn(async () => {
      throw new Error('token-endpoint-down');
    });
    await expect(service.createOrder('10.00', 'ORDER_1')).rejects.toThrow('获取PayPal访问令牌失败');
    expect(logged).toHaveBeenCalledWith(
      '获取PayPal访问令牌失败',
      expect.stringContaining('Error: token-endpoint-down'),
      'PayPalService',
    );
  });

  describe('webhooks', () => {
    // 原文里有空白、数字写法与 Unicode 转义：重新序列化会改变它们
    const raw =
      '{ "event_type" : "PAYMENT.CAPTURE.COMPLETED", "resource": { "id": "CAP1", "status": "COMPLETED",' +
      ' "custom_id": "ORDER_\\u0031", "amount": { "value": "10.50", "currency_code": "USD" } }, "n": 1.0e1 }';
    const headers = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-transmission-id': 'T-"quoted"',
      'paypal-transmission-sig': 'SIG',
      'paypal-transmission-time': '2026-10-02T00:00:00Z',
    };

    it('embeds the received event verbatim in the verification request and processes that same event', async () => {
      await expect(service.handleWebhook(headers, raw)).resolves.toMatchObject({
        type: 'PAYMENT.CAPTURE.COMPLETED',
        orderId: 'ORDER_1',
        amount: '10.50',
        captureId: 'CAP1',
      });

      const call = mockedAxios.post.mock.calls.find((item: any[]) =>
        item[0].endsWith('/v1/notifications/verify-webhook-signature'),
      );
      expect(call[0]).toBe(`${LIVE}/v1/notifications/verify-webhook-signature`);
      const body: string = call[1];
      expect(typeof body).toBe('string');
      expect(body.endsWith(`"webhook_event":${raw}}`)).toBe(true);
      const parsed = JSON.parse(body);
      expect(parsed).toMatchObject({
        auth_algo: 'SHA256withRSA',
        transmission_id: 'T-"quoted"',
        webhook_id: 'WH-1',
      });
      expect(call[2].headers.Authorization).toBe('Bearer token-1');
    });

    it('accepts a Buffer body and rejects a missing, malformed or non-object raw body', async () => {
      await expect(service.handleWebhook(headers, Buffer.from(raw))).resolves.toMatchObject({
        orderId: 'ORDER_1',
      });
      await expect(service.handleWebhook(headers, undefined)).rejects.toThrow(
        'PayPal Webhook缺少原始报文',
      );
      await expect(service.handleWebhook(headers, '  ')).rejects.toThrow(
        'PayPal Webhook缺少原始报文',
      );
      await expect(service.handleWebhook(headers, '{not json')).rejects.toMatchObject({
        status: 400,
      });
      await expect(service.handleWebhook(headers, '[1,2]')).rejects.toMatchObject({ status: 400 });
    });

    it('refuses without a webhook id and does not process events that fail verification', async () => {
      config.values.payPalWebhookId = '';
      await expect(service.handleWebhook(headers, raw)).rejects.toThrow('PayPal Webhook ID未配置');

      config.values.payPalWebhookId = 'WH-1';
      mockedAxios.post = jest.fn(async (url: string) =>
        url.endsWith('/v1/oauth2/token')
          ? { data: { access_token: 'token', expires_in: 32400 } }
          : { data: { verification_status: 'FAILURE' } },
      );
      await expect(service.handleWebhook(headers, raw)).rejects.toMatchObject({ status: 401 });
    });
  });
});

describe('PayPalService.getOrder', () => {
  const mockedAxios = axios as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the full order with a 10-second limit, including the token request', async () => {
    const config = createGlobalConfigFake(jest.fn, {
      payPalClientId: 'client-a',
      payPalClientSecret: 'secret-a',
      payPalMode: 'sandbox',
    });
    const service = new PayPalService(config as any);
    jest.spyOn(Logger, 'debug').mockImplementation((): void => undefined);
    mockedAxios.post = jest.fn(async () => ({
      data: { access_token: 'token-1', expires_in: 32400 },
    }));
    const full = { id: 'PAYPAL1', status: 'COMPLETED', purchase_units: [{ custom_id: 'ORDER_1' }] };
    mockedAxios.get = jest.fn(async () => ({ data: full }));

    await expect(service.getOrder('PAYPAL1')).resolves.toBe(full);

    expect(mockedAxios.post.mock.calls[0][2]).toMatchObject({ timeout: 10000 });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${SANDBOX}/v2/checkout/orders/PAYPAL1`,
      expect.objectContaining({
        timeout: 10000,
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });
});
