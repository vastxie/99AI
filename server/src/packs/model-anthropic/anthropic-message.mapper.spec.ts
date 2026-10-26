import {
  mapGatewayMessagesToAnthropicMessages,
  mapOpenAIChatToolsToAnthropicTools,
} from './anthropic-message.mapper';
import { normalizeModelHistory } from '@/modules/modelGateway/model-stream';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('anthropic-message.mapper', () => {
  it('keeps all native tool results adjacent with images nested under the correct call', () => {
    const result = mapGatewayMessagesToAnthropicMessages([
      {
        role: 'assistant',
        content: '',
        tool_calls: ['a', 'b'].map(id => ({
          id,
          type: 'function',
          function: { name: 'read', arguments: '{}' },
        })),
      },
      {
        role: 'tool',
        tool_call_id: 'a',
        content: [
          { type: 'text', text: 'chart' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'b',
        content: [{ type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'wav' } }],
      },
    ] as any);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1].content.map(part => part.tool_use_id)).toEqual(['a', 'b']);
    expect(result.messages[1].content[0].content[1]).toMatchObject({
      type: 'image',
      source: { data: 'aW1hZ2U=' },
    });
    expect(JSON.stringify(result.messages[1].content[1])).not.toContain('YXVkaW8=');
    expect(result.messages[1].content[1].content[0].text).toContain('不支持');
  });
  it('maps system, user image dataUrl, assistant tool calls, and tool results', () => {
    const mapped = mapGatewayMessagesToAnthropicMessages([
      { role: 'system', content: 'You are Claude.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aW1hZ2U=' },
          },
          {
            type: 'document',
            document: {
              name: 'report.pdf',
              data: 'data:application/pdf;base64,cGRm',
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'I will search.',
        reasoning_content: 'hidden reasoning must not be mapped',
        tool_calls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"docs"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_1', content: 'result text' },
    ]);

    const { sources, ...wire } = mapped;
    // sources 与线上消息对齐：助手消息对应原来的平台消息（回放厂商私有状态用），其余为 undefined
    expect(sources.map(source => source?.role)).toEqual([undefined, 'assistant', undefined]);
    expect(wire).toEqual({
      system: 'You are Claude.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'aW1hZ2U=',
              },
            },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: 'cGRm',
              },
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will search.' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'search',
              input: { q: 'docs' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'result text' }],
        },
      ],
    });
    expect(JSON.stringify(wire)).not.toContain('hidden reasoning');
  });

  it('preserves globally normalized call/result ids across repeated tool rounds', () => {
    const normalized = normalizeModelHistory(repeatedCallIdHistory() as any, {
      config: historyConfig('anthropic_messages'),
    });
    const mapped = mapGatewayMessagesToAnthropicMessages(normalized as any);
    const toolUses = mapped.messages.flatMap(message =>
      message.content.filter(part => part.type === 'tool_use'),
    );
    const toolResults = mapped.messages.flatMap(message =>
      message.content.filter(part => part.type === 'tool_result'),
    );

    expect(toolUses).toHaveLength(2);
    expect(new Set(toolUses.map(item => item.id)).size).toBe(2);
    expect(toolResults.map(item => item.tool_use_id)).toEqual(toolUses.map(item => item.id));
    expect(toolResults.map(item => item.content)).toEqual(['first result', 'second result']);
  });

  it('maps OpenAI-style function tools to Claude tools', () => {
    expect(
      mapOpenAIChatToolsToAnthropicTools([
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search docs',
            parameters: { type: 'object', properties: { q: { type: 'string' } } },
          },
        },
      ] as any),
    ).toEqual([
      {
        name: 'search',
        description: 'Search docs',
        input_schema: { type: 'object', properties: { q: { type: 'string' } } },
      },
    ]);

    expect(() => mapOpenAIChatToolsToAnthropicTools([{ type: 'web_search' }] as any)).toThrow(
      'function tools',
    );
  });

  it('rejects non-materialized image URLs to avoid leaking FileAsset URLs', () => {
    expect(() =>
      mapGatewayMessagesToAnthropicMessages([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: '/api/files/file_abc/preview' } }],
        },
      ]),
    ).toThrow('image dataUrl');
  });

  it('rejects non-materialized PDF documents', () => {
    expect(() =>
      mapGatewayMessagesToAnthropicMessages([
        {
          role: 'user',
          content: [{ type: 'document', document: { url: '/api/files/file_abc/download' } }],
        },
      ]),
    ).toThrow('PDF dataUrl');
  });
});

function repeatedCallIdHistory() {
  return [
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'same', type: 'function', function: { name: 'first_tool', arguments: '{}' } },
      ],
    },
    { role: 'tool', tool_call_id: 'same', content: 'first result' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'same', type: 'function', function: { name: 'second_tool', arguments: '{}' } },
      ],
    },
    { role: 'tool', tool_call_id: 'same', content: 'second result' },
  ];
}

function historyConfig(protocol: string) {
  return {
    protocol,
    model: 'fixture-model',
    apiKey: 'test',
    baseUrl: 'https://example.invalid',
  };
}
