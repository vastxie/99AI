import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { ChatLiveSyncService } from '../chatRealtime/chat-live-sync.service';
import { ChatControlService } from './chat-control.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ConversationTurnQueue } from './conversation-turn-queue.service';
import { WsAuthValidator } from './guards/ws-auth.guard';
import { WorkflowProcessManager } from './workflowManager.service';

declare const afterAll: any;
declare const afterEach: any;
declare const beforeAll: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/**
 * 经过生产接线（Nest 的 IoAdapter、网关的 afterInit / handleConnection / @SubscribeMessage）的握手鉴权：
 * 用真实的 socket.io 客户端连接，鉴权结果由替身控制。证明客户端收到 connect 时用户已经就绪（不再有首包被当成未登录的竞争）
 */
const auth = { authenticate: jest.fn() };

@Module({
  providers: [
    ChatGateway,
    { provide: WsAuthValidator, useValue: auth },
    { provide: ChatService, useValue: {} },
    { provide: WorkflowProcessManager, useValue: {} },
    { provide: ConversationTurnQueue, useValue: {} },
    { provide: ChatControlService, useValue: {} },
    { provide: ChatLiveSyncService, useValue: { bindServer: () => undefined } },
  ],
})
class HandshakeTestModule {}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const USER = { id: 7, role: 'user', uid: 'HandshakeUid1' };

describe('ChatGateway handshake over a real socket.io connection', () => {
  let app: INestApplication;
  let url: string;
  let launch: any;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(HandshakeTestModule, { logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    auth.authenticate.mockReset();
    launch = jest
      .spyOn(ChatGateway.prototype as any, 'launchChatProcessWithAck')
      .mockImplementation(async ({ client }: any) => ({
        ok: true,
        data: { userId: client.data.user?.id ?? null },
      }));
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.disconnect();
    jest.restoreAllMocks();
  });

  const connect = () => {
    const client = io(url, {
      path: '/api/socket.io',
      auth: { token: 'handshake-token' },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    return client;
  };
  const waitFor = <T = unknown>(client: ClientSocket, event: string) =>
    new Promise<T>(resolve => client.once(event as any, (arg: T) => resolve(arg)));

  it('does not let the client connect before authentication finishes, and the first packet sees the user', async () => {
    let release!: (result: unknown) => void;
    auth.authenticate
      .mockImplementationOnce(() => new Promise(resolve => (release = resolve)))
      .mockResolvedValue({ user: USER });
    const client = connect();
    let connected = false;
    client.on('connect', () => {
      connected = true;
    });

    await sleep(300);
    expect(connected).toBe(false);
    expect(auth.authenticate).toHaveBeenCalledTimes(1);
    expect(launch).not.toHaveBeenCalled();

    release({ user: USER });
    await waitFor(client, 'connect');
    // 一连上就发：原来这里会回执 UNAUTHORIZED
    const ack = await client.timeout(5000).emitWithAck('chat:start', { prompt: 'hello' });
    expect(ack).toEqual({ ok: true, data: { userId: 7 } });
  });

  it.each(['SESSION_INVALID', 'SESSION_UNAVAILABLE'])(
    'rejects the handshake with %s in the error data, and the client does not reconnect by itself',
    async (code: string) => {
      auth.authenticate.mockResolvedValue({ code });
      const client = connect();
      const error = await waitFor<Error & { data?: unknown }>(client, 'connect_error');
      expect(error.message).toBe('WebSocket 鉴权失败');
      expect(error.data).toEqual({ code });
      expect(client.active).toBe(false);
      expect(launch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['SESSION_INVALID', '登录状态已失效，请刷新后重试'],
    ['SESSION_UNAVAILABLE', '服务暂时不可用，请稍后重试'],
  ])(
    'answers a packet that fails revalidation with %s, skips the handler and disconnects',
    async (code: string, message: string) => {
      auth.authenticate.mockResolvedValueOnce({ user: USER }).mockResolvedValue({ code });
      const client = connect();
      await waitFor(client, 'connect');
      const disconnected = waitFor<string>(client, 'disconnect');

      const ack = await client.timeout(5000).emitWithAck('chat:start', { prompt: 'hello' });
      expect(ack).toEqual({ ok: false, code, message });
      expect(await disconnected).toBe('io server disconnect');
      expect(launch).not.toHaveBeenCalled();
    },
  );

  it('disconnects on a failed revalidation of a packet without an ack', async () => {
    auth.authenticate.mockResolvedValueOnce({ user: USER }).mockResolvedValue({
      code: 'SESSION_UNAVAILABLE',
    });
    const client = connect();
    await waitFor(client, 'connect');
    const disconnected = waitFor<string>(client, 'disconnect');
    client.emit('chat:start', { prompt: 'hello' });
    expect(await disconnected).toBe('io server disconnect');
    expect(launch).not.toHaveBeenCalled();
  });
});
