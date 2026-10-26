import { ModelStreamRegistry } from './model-stream.registry';
import type { ModelStreamAdapter, ModelStreamEvent } from './model-stream.types';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ModelStreamRegistry', () => {
  it('registers and looks up model stream adapters by protocol', () => {
    const adapters = [
      createAdapter('openai_chat_completions'),
      createAdapter('demo_responses'),
      createAdapter('demo_messages'),
      createAdapter('demo_generate'),
    ];
    const registry = ModelStreamRegistry.from(adapters);

    for (const adapter of adapters) {
      expect(registry.get(adapter.protocol)).toBe(adapter);
    }
    expect(registry.getProtocols()).toEqual([
      'openai_chat_completions',
      'demo_responses',
      'demo_messages',
      'demo_generate',
    ]);
    expect(registry.describe('demo_messages')?.label).toBe('demo_messages');
    expect(registry.has('missing_protocol')).toBe(false);
    expect(registry.listDescriptors()).toHaveLength(4);
  });

  it('throws a clear error for unregistered protocols', () => {
    const registry = ModelStreamRegistry.from([createAdapter('openai_chat_completions')]);

    expect(() => registry.get('missing_protocol')).toThrow('当前暂不支持协议真实调用');
  });

  it('requires registered adapters to declare a protocol', () => {
    const registry = new ModelStreamRegistry();

    expect(() => registry.register(createAdapter(''))).toThrow('缺少 protocol');
  });
});

function createAdapter(protocol: string): ModelStreamAdapter {
  return {
    protocol,
    descriptor: {
      protocol,
      label: protocol,
      endpoints: { default: '/v1/chat/completions', knownSuffixes: [] },
      multimodalTypes: [],
    },
    stream: jest.fn(() => events([{ type: 'done', finishReason: 'stop' }])),
  };
}

async function* events(items: ModelStreamEvent[]): AsyncGenerator<ModelStreamEvent> {
  for (const item of items) {
    yield item;
  }
}
