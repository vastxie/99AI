import { HttpException } from '@nestjs/common';
import { ChannelGatewayService } from './channel-gateway.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChannelGatewayService', () => {
  let chatService: { chatProcess: any };
  let userService: { getUserById: any };
  let modelsService: { getBaseConfig: any };
  let channelBinding: { listUserBindings: any; findUserByChannelUser: any };
  let service: ChannelGatewayService;

  beforeEach(() => {
    chatService = {
      chatProcess: jest.fn(async (_body: any, _user: any, emitter: any) => {
        emitter.emit({ type: 'agent.start', chatId: 5, data: {} });
        emitter.emit({ type: 'message.delta', chatId: 5, data: { delta: '你好' } });
        emitter.emit({ type: 'agent.end', chatId: 5, data: {} });
      }),
    };
    userService = { getUserById: jest.fn().mockResolvedValue({ id: 12, role: 'user', status: 1 }) };
    modelsService = {
      getBaseConfig: jest
        .fn()
        .mockResolvedValue({ modelInfo: { id: 3, model: 'gpt-x', modelName: 'GPT X' } }),
    };
    channelBinding = {
      listUserBindings: jest.fn(),
      findUserByChannelUser: jest.fn().mockResolvedValue({ userId: 12, status: 1 }),
    };
    service = new ChannelGatewayService(
      chatService as any,
      userService as any,
      modelsService as any,
      channelBinding as any,
    );
  });

  it('resolves the bound user, runs a chat turn on the channel and returns the collected reply', async () => {
    const result = await service.inbound({
      channel: 'demo_bot',
      channelUserId: 'wx-openid',
      text: '  hi  ',
      channelMessageId: 'm1',
      fileIds: ['file_' + 'c'.repeat(24)],
    });

    expect(channelBinding.findUserByChannelUser).toHaveBeenCalledWith('demo_bot', 'wx-openid');
    expect(chatService.chatProcess).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'hi', channelMessageId: 'm1', modelId: 3, model: 'gpt-x' }),
      { id: 12, role: 'user' },
      expect.anything(),
      undefined,
      'demo_bot',
    );
    expect(JSON.parse(chatService.chatProcess.mock.calls[0][0].url)).toEqual([
      { type: 'file', fileId: 'file_' + 'c'.repeat(24) },
    ]);
    expect(result).toEqual({ text: '你好', files: [], chatId: 5, userId: 12, timedOut: false });
  });

  it('accepts an explicit userId, rejects unbound channel users and empty text', async () => {
    channelBinding.findUserByChannelUser.mockResolvedValue(null);
    await expect(
      service.inbound({ channel: 'demo_bot', channelUserId: 'x', text: 'hi' }),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.inbound({ channel: 'demo_bot', userId: 12, text: '   ' }),
    ).rejects.toBeInstanceOf(HttpException);
    const result = await service.inbound({ channel: 'demo_bot', userId: 12, text: 'hi' });
    expect(result.userId).toBe(12);
    expect(channelBinding.findUserByChannelUser).toHaveBeenCalledTimes(1);
  });

  it('turns a failed chat into an error reply and enforces the timeout', async () => {
    chatService.chatProcess.mockRejectedValueOnce(new Error('model down'));
    const failed = await service.inbound({ channel: 'demo_bot', userId: 12, text: 'hi' });
    expect(failed.error).toEqual({ code: 'CHAT_FAILED', message: 'model down' });

    chatService.chatProcess.mockImplementationOnce(
      (_body: any, _user: any, emitter: any) =>
        new Promise<void>(resolve => {
          emitter.emit({ type: 'message.delta', data: { delta: 'partial' } });
          setTimeout(resolve, 5_000);
        }),
    );
    const slow = await service.inbound({
      channel: 'demo_bot',
      userId: 12,
      text: 'hi',
      timeoutMs: 1_000,
    });
    expect(slow.timedOut).toBe(true);
    expect(slow.text).toBe('partial');
    expect(slow.error?.code).toBe('CHANNEL_TIMEOUT');
  });
});
