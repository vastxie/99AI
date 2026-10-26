import { getChannelConfigStatus, isChannelConfigured } from './payment-config.helper';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('payment-config.helper', () => {
  it('requires Stripe webhook secret before marking the channel configured', () => {
    expect(
      isChannelConfigured('stripe_official', {
        stripeSecretKey: 'sk_test_xxx',
        stripePublishableKey: 'pk_test_xxx',
        stripeMode: 'test',
      }),
    ).toBe(false);

    expect(
      isChannelConfigured('stripe_official', {
        stripeSecretKey: 'sk_test_xxx',
        stripePublishableKey: 'pk_test_xxx',
        stripeMode: 'test',
        stripeWebhookSecret: 'whsec_xxx',
      }),
    ).toBe(true);
  });

  it('requires PayPal webhook id before marking the channel configured', () => {
    const status = getChannelConfigStatus('paypal_official', {
      payPalClientId: 'client',
      payPalClientSecret: 'secret',
      payPalMode: 'sandbox',
    });

    expect(status.configured).toBe(false);
    expect(status.missing).toContain('payPalWebhookId');
  });

  it('requires epay v2 platform public key for callback verification', () => {
    expect(
      isChannelConfigured('epay', {
        payEpayPid: 'merchant-id',
        payEpayApiPayUrl: 'https://pay.example.com/api/pay',
        payEpayApiQueryUrl: 'https://pay.example.com/api/query',
        payEpayApiVersion: 'v2',
        payEpayPrivateKey: 'private-key',
      }),
    ).toBe(false);

    expect(
      isChannelConfigured('epay', {
        payEpayPid: 'merchant-id',
        payEpayApiPayUrl: 'https://pay.example.com/api/pay',
        payEpayApiQueryUrl: 'https://pay.example.com/api/query',
        payEpayApiVersion: 'v2',
        payEpayPrivateKey: 'private-key',
        payEpayPublicKey: 'public-key',
      }),
    ).toBe(true);
  });

  it('keeps existing WeChat platform public key configs valid when serial is configured', () => {
    expect(
      isChannelConfigured('wechat_official', {
        payWeChatAppId: 'wx_app_001',
        payWeChatMchId: 'mch_001',
        payWeChatPrivateKey: 'merchant-private-key',
        payWeChatSecret: 'api-v3-secret',
        payWeChatPublicKey: 'platform-certificate',
        payWeChatPlatformSerialNo: 'PLATFORM_SERIAL',
      }),
    ).toBe(true);
  });

  it('does not require a separate WeChat platform serial when a full certificate is configured', () => {
    expect(
      isChannelConfigured('wechat_official', {
        payWeChatAppId: 'wx_app_001',
        payWeChatMchId: 'mch_001',
        payWeChatPrivateKey: 'merchant-private-key',
        payWeChatSecret: 'api-v3-secret',
        payWeChatPublicKey: '-----BEGIN CERTIFICATE-----\nMIIDEXAMPLE\n-----END CERTIFICATE-----',
      }),
    ).toBe(true);
  });

  it('requires WeChat platform serial when platform public key is configured without certificate', () => {
    const status = getChannelConfigStatus('wechat_official', {
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatPrivateKey: 'merchant-private-key',
      payWeChatSecret: 'api-v3-secret',
      payWeChatPublicKey: '-----BEGIN PUBLIC KEY-----\nMIIBEXAMPLE\n-----END PUBLIC KEY-----',
    });

    expect(status.configured).toBe(false);
    expect(status.missing).toContain('payWeChatPlatformSerialNo');
  });

  it('requires WeChat Pay public key id and public key in public key verification mode', () => {
    expect(
      isChannelConfigured('wechat_official', {
        payWeChatAppId: 'wx_app_001',
        payWeChatMchId: 'mch_001',
        payWeChatPrivateKey: 'merchant-private-key',
        payWeChatSecret: 'api-v3-secret',
        payWeChatVerifyMode: 'wechatpay_public_key',
        payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      }),
    ).toBe(false);

    const status = getChannelConfigStatus('wechat_official', {
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatPrivateKey: 'merchant-private-key',
      payWeChatSecret: 'api-v3-secret',
      payWeChatVerifyMode: 'wechatpay_public_key',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: 'wechatpay-public-key',
    });

    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it('requires both platform and public key configs in WeChat migration compatibility mode', () => {
    const incompleteStatus = getChannelConfigStatus('wechat_official', {
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatPrivateKey: 'merchant-private-key',
      payWeChatSecret: 'api-v3-secret',
      payWeChatVerifyMode: 'auto_compat',
      payWeChatPublicKey: '-----BEGIN PUBLIC KEY-----\nMIIBEXAMPLE\n-----END PUBLIC KEY-----',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
    });

    expect(incompleteStatus.configured).toBe(false);
    expect(incompleteStatus.missing).toContain('payWeChatPlatformSerialNo');
    expect(incompleteStatus.missing).toContain('payWeChatWechatpayPublicKey');

    const completeStatus = getChannelConfigStatus('wechat_official', {
      payWeChatAppId: 'wx_app_001',
      payWeChatMchId: 'mch_001',
      payWeChatPrivateKey: 'merchant-private-key',
      payWeChatSecret: 'api-v3-secret',
      payWeChatVerifyMode: 'auto_compat',
      payWeChatPublicKey: '-----BEGIN CERTIFICATE-----\nMIIDEXAMPLE\n-----END CERTIFICATE-----',
      payWeChatWechatpayPublicKeyId: 'PUB_KEY_ID_001',
      payWeChatWechatpayPublicKey: 'wechatpay-public-key',
    });

    expect(completeStatus.configured).toBe(true);
    expect(completeStatus.missing).toEqual([]);
  });

  it('epay version rule: empty or v1 needs the key, v2 needs both RSA keys, unknown versions are never configured', () => {
    const base = {
      payEpayPid: 'merchant-id',
      payEpayApiPayUrl: 'https://pay.example.com/api/pay',
      payEpayApiQueryUrl: 'https://pay.example.com/api/query',
    };
    for (const payEpayApiVersion of [undefined, '', 'v1']) {
      expect(isChannelConfigured('epay', { ...base, payEpayApiVersion, payEpayKey: 'k' })).toBe(
        true,
      );
      expect(getChannelConfigStatus('epay', { ...base, payEpayApiVersion })).toMatchObject({
        configured: false,
        missing: ['payEpayKey'],
      });
    }
    const allKeys = { payEpayKey: 'k', payEpayPrivateKey: 'p', payEpayPublicKey: 'pub' };
    expect(isChannelConfigured('epay', { ...base, ...allKeys, payEpayApiVersion: 'v2' })).toBe(
      true,
    );
    for (const payEpayApiVersion of ['v3', 'V2', 'md5']) {
      expect(isChannelConfigured('epay', { ...base, ...allKeys, payEpayApiVersion })).toBe(false);
      expect(
        getChannelConfigStatus('epay', { ...base, ...allKeys, payEpayApiVersion }),
      ).toMatchObject({ configured: false, missing: ['payEpayApiVersion'] });
    }
  });
});
