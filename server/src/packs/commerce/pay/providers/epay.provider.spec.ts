import { Logger } from '@nestjs/common';
import axios from 'axios';
import { createGlobalConfigFake } from '../../test/global-config.fake';
import { PaymentMethod } from '../payment.types';
import { EpayProvider } from './epay.provider';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('axios');

const urls = {
  notifyUrl: 'https://example.com/api/pay/notify',
  returnUrl: 'https://example.com/api/pay/return',
} as any;

describe('EpayProvider', () => {
  const mockedAxios = axios as any;
  let config: ReturnType<typeof createGlobalConfigFake>;
  let provider: EpayProvider;

  beforeEach(() => {
    config = createGlobalConfigFake(jest.fn, {
      payEpayPid: '1000',
      payEpayKey: 'v1-key',
      payEpayApiPayUrl: 'https://pay.example.com/submit.php',
      payEpayApiQueryUrl: 'https://pay.example.com/api.php',
    });
    provider = new EpayProvider(config as any, async () => urls);
    mockedAxios.get = jest.fn(async () => ({
      data: { code: 1, status: '1', out_trade_no: 'ORDER_1', trade_no: 'T1', money: '10.00' },
    }));
    mockedAxios.post = jest.fn(async () => ({
      data: { code: 0, status: '1', out_trade_no: 'ORDER_1', trade_no: 'T1', money: '10.00' },
    }));
    jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createCtx = (clientIp?: string) => ({
    userId: 1,
    orderId: 'ORDER_1',
    order: { total: 10 } as any,
    goods: { name: 'Plan' } as any,
    method: PaymentMethod.ALIPAY,
    device: 'pc',
    clientIp,
  });
  const redirectQuery = (result: any) =>
    new URL(result.display.payload.url).searchParams as URLSearchParams;

  it('sends the order client IP (loopback when unknown) and signs v1 / unset versions with MD5', async () => {
    const withIp = await provider.createPayment(createCtx('203.0.113.9'));
    expect(redirectQuery(withIp).get('clientip')).toBe('203.0.113.9');
    expect(redirectQuery(withIp).get('sign_type')).toBe('MD5');

    const withoutIp = await provider.createPayment(createCtx());
    expect(redirectQuery(withoutIp).get('clientip')).toBe('127.0.0.1');
  });

  it('posts mapi orders and reads the reply by the configured version', async () => {
    config.values.payEpayApiPayUrl = 'https://pay.example.com/mapi.php';
    const reply = (data: Record<string, unknown>) => {
      mockedAxios.post = jest.fn(async () => ({ data }));
    };
    const form = () => mockedAxios.post.mock.calls[0][1] as URLSearchParams;

    // v1：MD5 签名，payurl 跳转、qrcode 二维码；v2 格式的回复（code 0）不算成功
    reply({ code: 1, payurl: 'https://pay.example.com/jump/1' });
    await expect(provider.createPayment(createCtx('203.0.113.9'))).resolves.toMatchObject({
      display: { type: 'redirect_url', payload: { url: 'https://pay.example.com/jump/1' } },
    });
    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://pay.example.com/mapi.php');
    expect(form().get('sign_type')).toBe('MD5');
    expect(form().get('clientip')).toBe('203.0.113.9');
    reply({ code: 1, qrcode: 'weixin://wxpay/1' });
    await expect(provider.createPayment(createCtx())).resolves.toMatchObject({
      display: { type: 'qr_content', payload: { content: 'weixin://wxpay/1' } },
    });
    reply({ code: 0, msg: 'v2-shaped-reply', pay_type: 'qrcode', pay_info: 'weixin://wxpay/2' });
    await expect(provider.createPayment(createCtx())).rejects.toThrow('v2-shaped-reply');

    // v2（配置值带空白也按 v2）：RSA 签名，按 pay_type 解析；v1 格式的回复（code 1）不算成功
    const { generateKeyPairSync } = require('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    Object.assign(config.values, { payEpayApiVersion: ' v2 ', payEpayPrivateKey: privateKey });
    reply({ code: 0, pay_type: 'qrcode', pay_info: 'weixin://wxpay/3' });
    await expect(provider.createPayment(createCtx())).resolves.toMatchObject({
      display: { type: 'qr_content', payload: { content: 'weixin://wxpay/3' } },
    });
    expect(form().get('sign_type')).toBe('RSA');
    reply({ code: 0, pay_type: 'jump', pay_info: 'https://pay.example.com/jump/2' });
    await expect(provider.createPayment(createCtx())).resolves.toMatchObject({
      display: { type: 'redirect_url', payload: { url: 'https://pay.example.com/jump/2' } },
    });
    reply({ code: 1, msg: 'v1-shaped-reply', payurl: 'https://pay.example.com/jump/3' });
    await expect(provider.createPayment(createCtx())).rejects.toThrow('v1-shaped-reply');
  });

  it('refuses invalid versions and missing version keys before any outbound request', async () => {
    for (const [overrides, message] of [
      [{ payEpayApiVersion: 'v3' }, '易支付接口版本无效'],
      [{ payEpayApiVersion: 'v2', payEpayPrivateKey: '' }, '易支付配置不完整'],
      [{ payEpayApiVersion: 'v1', payEpayKey: '' }, '易支付配置不完整'],
    ] as Array<[Record<string, string>, string]>) {
      Object.assign(
        config.values,
        { payEpayKey: 'v1-key', payEpayPrivateKey: undefined },
        overrides,
      );
      await expect(provider.createPayment(createCtx())).rejects.toThrow(message);
      await expect(provider.queryOrder({ orderId: 'ORDER_1' })).rejects.toThrow(message);
    }
    // v2 缺私钥但残留 v1 密钥：不转入 v1 查询
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('queries with the path that matches the version', async () => {
    await expect(provider.queryOrder({ orderId: 'ORDER_1' })).resolves.toEqual({
      state: 'paid',
      orderId: 'ORDER_1',
      tradeId: 'T1',
      amount: '10.00',
      currency: 'CNY',
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get.mock.calls[0][1]).toMatchObject({ timeout: 10000 });
    expect(mockedAxios.post).not.toHaveBeenCalled();

    config.values.payEpayApiVersion = '';
    await provider.queryOrder({ orderId: 'ORDER_1' });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);

    const { generateKeyPairSync } = require('crypto');
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    Object.assign(config.values, { payEpayApiVersion: 'v2', payEpayPrivateKey: privateKey });
    await expect(provider.queryOrder({ orderId: 'ORDER_1' })).resolves.toMatchObject({
      state: 'paid',
    });
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][2]).toMatchObject({ timeout: 10000 });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['numeric paid status', { status: 1 }, 'paid'],
    ['trade_status success', { status: '0', trade_status: 'TRADE_SUCCESS' }, 'paid'],
    ['unpaid', { status: '0' }, 'pending'],
    ['missing order number', { out_trade_no: undefined }, 'unknown'],
    ['another order', { out_trade_no: 'ORDER_2' }, 'unknown'],
  ])('maps %s to %s', async (_name: string, patch: Record<string, unknown>, state: string) => {
    mockedAxios.get = jest.fn(async () => ({
      data: {
        code: 1,
        status: '1',
        out_trade_no: 'ORDER_1',
        trade_no: 'T1',
        money: '10.00',
        ...patch,
      },
    }));
    await expect(provider.queryOrder({ orderId: 'ORDER_1' })).resolves.toMatchObject({
      state,
      orderId: 'ORDER_1',
    });
  });
});
