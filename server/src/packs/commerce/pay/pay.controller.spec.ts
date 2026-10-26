import { IS_PUBLIC_KEY } from '@/common/auth/public.decorator';
import { PayController } from './pay.controller';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PayController notify exits', () => {
  let callbackService: any;
  let controller: PayController;

  beforeEach(() => {
    callbackService = {
      handleNotify: jest.fn(),
      handleReturn: jest.fn(),
    };
    controller = new PayController({} as any, callbackService, {
      getConfigs: jest.fn(() => 'https://example.com'),
    } as any);
  });

  it('routes GET notify payloads into the unified callback service', async () => {
    const query = { param: 'epay', out_trade_no: 'ORDER_001' };
    callbackService.handleNotify.mockResolvedValue('success');

    await expect(controller.paymentNotify({ method: 'GET' } as any, query, {}, {})).resolves.toBe(
      'success',
    );

    expect(callbackService.handleNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        providerHint: 'epay',
        method: 'GET',
        rawParams: query,
      }),
    );
  });

  it('routes POST notify payloads into the unified callback service', async () => {
    const body = { trade_status: 'TRADE_SUCCESS', out_trade_no: 'ORDER_001' };
    callbackService.handleNotify.mockResolvedValue('success');

    await expect(
      controller.paymentNotify({ method: 'POST', rawBody: Buffer.from('{}') } as any, {}, body, {
        'stripe-signature': 'sig',
      }),
    ).resolves.toBe('success');

    expect(callbackService.handleNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        rawParams: body,
        headers: { 'stripe-signature': 'sig' },
        rawBody: Buffer.from('{}'),
      }),
    );
  });

  it('routes browser return success into the callback service and renders success html', async () => {
    callbackService.handleReturn.mockResolvedValue({ success: true });
    const res = {
      header: jest.fn(),
      send: jest.fn((value: string) => value),
    };

    const html = await controller.paymentReturn(
      { provider: 'stripe', status: 'success', session_id: 'sess_001' },
      res as any,
      'zh-CN',
    );

    expect(callbackService.handleReturn).toHaveBeenCalledWith('stripe', 'success', {
      provider: 'stripe',
      status: 'success',
      session_id: 'sess_001',
    });
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'text/html');
    expect(html).toContain('支付成功');
    // 回到用户端的 history 路由（不再是 /#/chat），用 replace 不留结果页；在新窗口里付的直接关掉结果页，关不掉时照常回去
    expect(html).toContain("window.location.replace('https://example.com/?payment=success')");
    expect(html).not.toContain('window.location.href');
    expect(html).toContain(
      'if (window.opener && !window.opener.closed) { window.close(); setTimeout(',
    );
  });

  it('renders a neutral page for returns that carry no verifiable result (epay / alipay)', async () => {
    callbackService.handleReturn.mockResolvedValue({ status: 'returned' });
    const res = {
      header: jest.fn(),
      send: jest.fn((value: string) => value),
    };

    const html = await controller.paymentReturn(
      { provider: 'epay', status: 'success' },
      res as any,
      'zh-CN',
    );

    expect(html).toContain('正在确认支付');
    expect(html).not.toContain('支付成功');
    expect(html).toContain("window.location.replace('https://example.com/?payment=returned')");
  });

  it('renders the failed page with the same return rules when verification fails', async () => {
    callbackService.handleReturn.mockRejectedValue(new Error('verify failed'));
    const res = {
      header: jest.fn(),
      send: jest.fn((value: string) => value),
    };

    const html = await controller.paymentReturn(
      { provider: 'stripe', status: 'success' },
      res as any,
      'zh-CN',
    );

    expect(html).toContain("window.location.replace('https://example.com/?payment=failed')");
    expect(html).toContain(
      'if (window.opener && !window.opener.closed) { window.close(); setTimeout(',
    );
    expect(html).not.toContain('#/chat');
  });

  it('does not ACK unified notify errors as success', async () => {
    callbackService.handleNotify.mockRejectedValue(new Error('invalid signature'));

    await expect(
      controller.paymentNotify(
        { method: 'POST', rawBody: '{}' } as any,
        { provider: 'stripe' },
        {},
        {},
      ),
    ).rejects.toThrow('invalid signature');
  });

  it('marks payment notify and return routes as public auth metadata', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PayController.prototype.paymentNotify)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PayController.prototype.paymentReturn)).toBe(true);
  });
});

describe('PayController admin payment tests', () => {
  it('passes the admin request client IP to both test entries', async () => {
    const payService = {
      testPayment: jest.fn(async () => ({ success: true })),
      createFullPaymentTest: jest.fn(async () => ({ success: true })),
    };
    const controller = new PayController(payService as any, {} as any, {} as any);
    const req = {
      user: { id: 7, role: 'super' },
      headers: {},
      socket: { remoteAddress: '203.0.113.9' },
    } as any;

    await controller.testPayment(req, { method: 'alipay' } as any);
    await controller.createFullPaymentTest(req, { method: 'alipay', packageId: 3 } as any);

    expect(payService.testPayment).toHaveBeenCalledWith(7, 'alipay', '203.0.113.9');
    expect(payService.createFullPaymentTest).toHaveBeenCalledWith(7, 'alipay', 3, '203.0.113.9');
  });
});
