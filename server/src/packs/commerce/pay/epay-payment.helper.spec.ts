import { Logger } from '@nestjs/common';
import { EpayPaymentHelper } from './epay-payment.helper';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/**
 * 锁定 epay P0 修复：verifyCallback 在 MD5 分支必须拒绝空密钥，
 * 防止 v2(RSA) 模式下 payEpayKey 为空时用空密钥伪造任意成功支付回执。
 */
describe('EpayPaymentHelper.verifyCallback 空密钥伪造防护', () => {
  const baseParams = {
    pid: '100',
    out_trade_no: 'ORDER_1',
    trade_no: 'T_1',
    money: '10.00',
    trade_status: 'TRADE_SUCCESS',
  };

  it('拒绝空密钥 MD5 伪造（v2 误配：payEpayKey 为空）', () => {
    // 攻击者用空密钥计算 MD5，试图伪造成功回执
    const forgedSign = EpayPaymentHelper.signMD5(baseParams, '');
    const result = EpayPaymentHelper.verifyCallback(
      { ...baseParams, sign: forgedSign, sign_type: 'MD5' },
      { key: '' },
    );
    expect(result).toBe(false);
  });

  it('空/缺省 key 一律拒绝，不论 sign 取值', () => {
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...baseParams, sign: 'any', sign_type: 'MD5' },
        { key: '' },
      ),
    ).toBe(false);
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...baseParams, sign: 'any', sign_type: 'MD5' },
        { key: undefined as unknown as string },
      ),
    ).toBe(false);
  });

  it('合法 MD5 回调（真实 key）正常通过，无回归', () => {
    const key = 'real-secret-key';
    const sign = EpayPaymentHelper.signMD5(baseParams, key);
    const result = EpayPaymentHelper.verifyCallback(
      { ...baseParams, sign, sign_type: 'MD5' },
      { key },
    );
    expect(result).toBe(true);
  });

  it('真实 key 配置下，空密钥伪造的 sign 不被接受', () => {
    const forged = EpayPaymentHelper.signMD5(baseParams, '');
    const result = EpayPaymentHelper.verifyCallback(
      { ...baseParams, sign: forged, sign_type: 'MD5' },
      { key: 'real-secret-key' },
    );
    expect(result).toBe(false);
  });
});

describe('EpayPaymentHelper 按配置的版本锁定签名方式', () => {
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const params = {
    pid: '100',
    out_trade_no: 'ORDER_1',
    trade_no: 'T_1',
    money: '10.00',
    trade_status: 'TRADE_SUCCESS',
  };
  const key = 'real-secret-key';
  const md5 = EpayPaymentHelper.signMD5(params, key);
  const rsa = EpayPaymentHelper.signRSA(params, privateKey);

  it('v1（含未设置）只接受 MD5 或缺省的 sign_type', () => {
    for (const apiVersion of [undefined, '', 'v1']) {
      expect(EpayPaymentHelper.verifyCallback({ ...params, sign: md5 }, { key, apiVersion })).toBe(
        true,
      );
      expect(
        EpayPaymentHelper.verifyCallback(
          { ...params, sign: md5, sign_type: 'MD5' },
          { key, apiVersion },
        ),
      ).toBe(true);
      // v1 下发来 RSA 签名：即使配了公钥也拒绝
      expect(
        EpayPaymentHelper.verifyCallback(
          { ...params, sign: rsa, sign_type: 'RSA' },
          { key, publicKey, apiVersion },
        ),
      ).toBe(false);
    }
  });

  it('v2 只接受 RSA 且必须配置平台公钥；残留的 v1 密钥签的 MD5 被拒', () => {
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...params, sign: rsa, sign_type: 'RSA' },
        { key, publicKey, apiVersion: 'v2' },
      ),
    ).toBe(true);
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...params, sign: md5, sign_type: 'MD5' },
        { key, publicKey, apiVersion: 'v2' },
      ),
    ).toBe(false);
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...params, sign: md5 },
        { key, publicKey, apiVersion: 'v2' },
      ),
    ).toBe(false);
    // 缺公钥：不退回 MD5
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...params, sign: rsa, sign_type: 'RSA' },
        { key, apiVersion: 'v2' },
      ),
    ).toBe(false);
  });

  it('无效版本、未知算法、缺签名一律拒绝', () => {
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...params, sign: md5, sign_type: 'MD5' },
        { key, apiVersion: 'v3' },
      ),
    ).toBe(false);
    expect(
      EpayPaymentHelper.verifyCallback(
        { ...params, sign: md5, sign_type: 'SHA256' },
        { key, apiVersion: 'v1' },
      ),
    ).toBe(false);
    expect(EpayPaymentHelper.verifyCallback({ ...params }, { key, apiVersion: 'v1' })).toBe(false);
  });

  it('下单签名与回调同一版本规则：无效版本、v2 缺私钥都不降级到 MD5', () => {
    const base = {
      pid: '100',
      type: 'alipay',
      out_trade_no: 'ORDER_1',
      name: 'Plan',
      money: '10.00',
      clientip: '203.0.113.9',
      device: 'pc',
      notify_url: 'https://example.com/n',
      return_url: 'https://example.com/r',
    };
    expect(() => EpayPaymentHelper.autoBuildParams(base, { key, apiVersion: 'v3' })).toThrow(
      '易支付接口版本无效',
    );
    expect(() => EpayPaymentHelper.autoBuildParams(base, { key, apiVersion: 'v2' })).toThrow(
      '易支付 v2 需要配置商户私钥',
    );
    expect(EpayPaymentHelper.autoBuildParams(base, { key, apiVersion: '' }).sign_type).toBe('MD5');
    expect(
      EpayPaymentHelper.autoBuildParams(base, { key, privateKey, apiVersion: 'v2' }).sign_type,
    ).toBe('RSA');
  });

  it('签名失败时日志是静态文案，私钥解析的细节只在抛出的错误里', () => {
    const logged = jest.spyOn(Logger, 'error').mockImplementation((): void => undefined);
    const base = { pid: '100', type: 'alipay', out_trade_no: 'ORDER_1', name: 'Plan', money: '10' };
    expect(() =>
      EpayPaymentHelper.autoBuildParams(base as any, {
        key,
        privateKey: 'not-a-private-key',
        apiVersion: 'v2',
      }),
    ).toThrow('易支付RSA签名失败');
    expect(logged.mock.calls.map((call: any[]) => [call[0], call[2]])).toEqual([
      ['易支付RSA签名失败', 'EpayPaymentHelper'],
      ['构建易支付V2参数失败', 'EpayPaymentHelper'],
    ]);
    // 异常的堆栈放在第二个参数
    expect(logged.mock.calls.every((call: any[]) => typeof call[1] === 'string')).toBe(true);

    // 验签抛错：验签时 Node 加密库抛出的错误在 Jest 里跨上下文（instanceof Error 不成立），这里换成本上下文的错误看日志参数
    logged.mockClear();
    const createVerify = jest.spyOn(require('crypto'), 'createVerify').mockReturnValue({
      update: () => undefined,
      end: () => undefined,
      verify: () => {
        throw new Error('bad-public-key-detail');
      },
    });
    expect(EpayPaymentHelper.verifyRSA({ a: '1' }, 'c2ln', 'not-a-public-key')).toBe(false);
    expect(logged).toHaveBeenCalledWith(
      'RSA验签失败',
      expect.stringContaining('Error: bad-public-key-detail'),
      'EpayPaymentHelper',
    );
    createVerify.mockRestore();
    logged.mockRestore();
  });
});
