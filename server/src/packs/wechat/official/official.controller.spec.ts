import { OfficialController } from './official.controller';
import { IS_PUBLIC_KEY } from '@/common/auth/public.decorator';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('OfficialController', () => {
  const createService = () => ({
    verify: jest.fn(),
    handleNotifyPostMessage: jest.fn(),
  });

  const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  });

  const createScanPayload = (sceneStr = 'login-scene') => ({
    xml: {
      MsgType: ['event'],
      Event: ['SCAN'],
      EventKey: [sceneStr],
      FromUserName: ['wechat-openid'],
    },
  });

  it('rejects POST callbacks before business handling when signature is missing', async () => {
    const service = createService();
    service.verify.mockResolvedValue(false);
    const controller = new OfficialController(service as any);
    const res = createResponse();

    await controller.notifyPost({} as any, {}, createScanPayload(), res as any);

    expect(service.verify).toHaveBeenCalledWith(undefined, undefined, undefined);
    expect(service.handleNotifyPostMessage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('');
  });

  it('rejects POST callbacks before business handling when signature is invalid', async () => {
    const service = createService();
    service.verify.mockResolvedValue(false);
    const controller = new OfficialController(service as any);
    const res = createResponse();

    await controller.notifyPost(
      {} as any,
      { signature: 'bad', nonce: 'nonce', timestamp: 'timestamp' },
      createScanPayload(),
      res as any,
    );

    expect(service.verify).toHaveBeenCalledWith('bad', 'nonce', 'timestamp');
    expect(service.handleNotifyPostMessage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('');
  });

  it('delegates POST message handling after signature is verified', async () => {
    const service = createService();
    service.verify.mockResolvedValue(true);
    service.handleNotifyPostMessage.mockResolvedValue('success');
    const controller = new OfficialController(service as any);
    const res = createResponse();
    const payload = createScanPayload('login-scene');

    await controller.notifyPost(
      {} as any,
      { signature: 'ok', nonce: 'nonce', timestamp: 'timestamp' },
      payload,
      res as any,
    );

    expect(service.handleNotifyPostMessage).toHaveBeenCalledWith(payload);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('success');
  });

  it('marks official public routes as public auth metadata', () => {
    const publicHandlers = [
      OfficialController.prototype.notify,
      OfficialController.prototype.notifyPost,
    ];

    for (const handler of publicHandlers) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    }
  });
});
