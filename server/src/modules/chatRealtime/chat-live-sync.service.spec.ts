import { ChatLiveSyncService } from './chat-live-sync.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatLiveSyncService', () => {
  it('emits chat sync events to the authenticated user room', () => {
    const room = { emit: jest.fn() };
    const server = {
      to: jest.fn().mockReturnValue(room),
    };
    const service = new ChatLiveSyncService();

    service.bindServer(server as any);
    service.emitToUser(7, {
      type: 'turn_created',
      channel: 'demo_bot',
      conversationGid: 'g_0123456789abcdefghijklmn',
      cids: { user: 'c_user', assistant: 'c_assistant' },
    });

    expect(server.to).toHaveBeenCalledWith('user:7');
    expect(room.emit).toHaveBeenCalledWith(
      'chat:sync',
      expect.objectContaining({
        type: 'turn_created',
        userId: 7,
        channel: 'demo_bot',
        conversationGid: 'g_0123456789abcdefghijklmn',
        cids: { user: 'c_user', assistant: 'c_assistant' },
      }),
    );
    expect(room.emit.mock.calls[0][1].timestamp).toEqual(expect.any(Number));
  });

  it('does nothing before a socket server is bound', () => {
    const service = new ChatLiveSyncService();

    expect(() =>
      service.emitToUser(7, {
        type: 'turn_done',
        channel: 'web',
        conversationGid: 'g_0123456789abcdefghijklmn',
      }),
    ).not.toThrow();
  });
});
