import { ChatTitleService } from './chat-title.service';
import { createOpaqueModelGatewaySessionId } from '../modelGateway/model-gateway-session';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ChatTitleService provider session', () => {
  it('shares the conversation-scoped opaque session with title generation', async () => {
    const config = {
      protocol: 'test',
      model: 'fixture-model',
      apiKey: 'fixture-secret',
      baseUrl: 'https://example.invalid',
    };
    const gateway = {
      completeOnce: jest.fn().mockResolvedValue({ content: '探针会话标题' }),
    };
    const service = new ChatTitleService(
      {} as any,
      { resolveModelGatewayConfig: jest.fn().mockReturnValue(config) } as any,
      gateway as any,
      { buildRuleBasedTitleFromMessage: jest.fn((value: string) => value) } as any,
    );

    await expect((service as any).generateChatTitleWithAI('请总结这个主题', {}, 42)).resolves.toBe(
      '探针会话标题',
    );
    expect(gateway.completeOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'chat_title',
        sessionId: createOpaqueModelGatewaySessionId('group:42'),
      }),
    );
    // 不设温度：按模型服务自己的默认值
    expect(gateway.completeOnce.mock.calls[0][0]).not.toHaveProperty('temperature');
  });
});
