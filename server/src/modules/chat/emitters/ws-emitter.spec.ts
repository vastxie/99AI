import { WSEmitter } from './ws-emitter';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('WSEmitter', () => {
  it('stamps the submission id on errors sent for this chat:start, leaving other events alone', () => {
    const socket = { emit: jest.fn() };
    const emitter = new WSEmitter(socket as any, 'submission-emitter-0001');

    emitter.emit({
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: { code: 'RATE_LIMIT', message: 'x' },
    } as any);
    emitter.emit({
      type: 'message.delta',
      chatId: 'c_1',
      timestamp: 1,
      data: { delta: 'hi' },
    } as any);

    expect(socket.emit.mock.calls[0][1].data).toEqual({
      code: 'RATE_LIMIT',
      message: 'x',
      submissionId: 'submission-emitter-0001',
    });
    expect(socket.emit.mock.calls[1][1].data).toEqual({ delta: 'hi' });
  });

  it('keeps an explicit submission id and sends nothing extra without one', () => {
    const socket = { emit: jest.fn() };
    new WSEmitter(socket as any, 'submission-emitter-0001').emit({
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: { code: 'X', message: 'x', submissionId: 'submission-other-00001' },
    } as any);
    new WSEmitter(socket as any).emit({
      type: 'agent.error',
      chatId: 'pending',
      timestamp: 1,
      data: { code: 'X', message: 'x' },
    } as any);
    expect(socket.emit.mock.calls[0][1].data.submissionId).toBe('submission-other-00001');
    expect(socket.emit.mock.calls[1][1].data).not.toHaveProperty('submissionId');
  });
});
