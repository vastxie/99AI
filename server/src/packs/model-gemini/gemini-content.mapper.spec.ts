import {
  mapGatewayMessagesToGeminiContent,
  mapOpenAIChatToolsToGeminiTools,
} from './gemini-content.mapper';
import { normalizeModelHistory } from '@/modules/modelGateway/model-stream';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('gemini-content.mapper', () => {
  it('keeps function responses before tool image/audio input and preserves the source call', () => {
    const result = mapGatewayMessagesToGeminiContent([
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
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }],
      },
      {
        role: 'tool',
        tool_call_id: 'b',
        content: [{ type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'wav' } }],
      },
    ] as any);
    expect(result.contents[1].parts[0].functionResponse.name).toBe('read');
    expect(result.contents[1].parts[1].functionResponse.name).toBe('read');
    expect(result.contents).toHaveLength(2);
    const media = result.contents[1].parts.slice(2);
    expect(media[0].text).toContain('a');
    expect(media[1].inlineData).toEqual({ mimeType: 'image/png', data: 'aW1hZ2U=' });
    expect(media[2].text).toContain('b');
    expect(media[3].inlineData).toEqual({ mimeType: 'audio/wav', data: 'YXVkaW8=' });
  });
  it('maps system, text, image dataUrl, assistant function calls, and function responses', () => {
    const mapped = mapGatewayMessagesToGeminiContent([
      { role: 'system', content: 'You are Gemini.' },
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
            document: { data: 'data:application/pdf;base64,cGRm' },
          },
          {
            type: 'input_audio',
            input_audio: { data: 'YXVkaW8=', format: 'wav' },
          },
          {
            type: 'video_url',
            video_url: { url: 'data:video/mp4;base64,dmlkZW8=' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'I will search.',
        reasoning_content: 'hidden reasoning must not be mapped',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"docs"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'result text' },
    ]);

    expect(mapped).toEqual({
      systemInstruction: { parts: [{ text: 'You are Gemini.' }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'describe' },
            { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } },
            { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
            { inlineData: { mimeType: 'audio/wav', data: 'YXVkaW8=' } },
            { inlineData: { mimeType: 'video/mp4', data: 'dmlkZW8=' } },
          ],
        },
        {
          role: 'model',
          parts: [
            { text: 'I will search.' },
            { functionCall: { name: 'search', args: { q: 'docs' } } },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'search',
                response: { content: 'result text' },
              },
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(mapped)).not.toContain('hidden reasoning');
  });

  it('preserves round-local function association after global call-id normalization', () => {
    const normalized = normalizeModelHistory(repeatedCallIdHistory() as any, {
      config: historyConfig('gemini_generate_content'),
    });
    const mapped = mapGatewayMessagesToGeminiContent(normalized as any);
    const calls = mapped.contents.flatMap(message =>
      message.parts.filter(part => part.functionCall).map(part => part.functionCall),
    );
    const results = mapped.contents.flatMap(message =>
      message.parts.filter(part => part.functionResponse).map(part => part.functionResponse),
    );

    expect(calls.map(item => item.name)).toEqual(['first_tool', 'second_tool']);
    expect(results.map(item => item.name)).toEqual(['first_tool', 'second_tool']);
    expect(results.map(item => item.response.content)).toEqual(['first result', 'second result']);
  });

  it('maps OpenAI-style function tools to Gemini functionDeclarations', () => {
    expect(
      mapOpenAIChatToolsToGeminiTools([
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
        functionDeclarations: [
          {
            name: 'search',
            description: 'Search docs',
            parameters: { type: 'object', properties: { q: { type: 'string' } } },
          },
        ],
      },
    ]);

    expect(() => mapOpenAIChatToolsToGeminiTools([{ type: 'web_search' }] as any)).toThrow(
      'function tools',
    );
  });

  it('strips JSON Schema fields Gemini function declarations do not accept', () => {
    const mapped = mapOpenAIChatToolsToGeminiTools([
      {
        type: 'function',
        function: {
          name: 'runtime_tool',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              files: {
                type: 'array',
                examples: ['ignored'],
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    fileRef: { type: 'string', examples: ['file_1'] },
                  },
                  required: ['fileRef'],
                },
              },
              mode: {
                type: ['string', 'null'],
                enum: ['merge', 'extract'],
                examples: ['merge'],
              },
              pages: {
                type: 'array',
                description: 'Gemini requires items even when the source schema is open.',
              },
            },
            required: ['files'],
          },
        },
      },
    ] as any);

    expect(JSON.stringify(mapped)).not.toContain('additionalProperties');
    expect(JSON.stringify(mapped)).not.toContain('examples');
    expect(mapped).toEqual([
      {
        functionDeclarations: [
          {
            name: 'runtime_tool',
            parameters: {
              type: 'object',
              properties: {
                files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      fileRef: { type: 'string' },
                    },
                    required: ['fileRef'],
                  },
                },
                mode: {
                  type: 'string',
                  nullable: true,
                  enum: ['merge', 'extract'],
                },
                pages: {
                  type: 'array',
                  description: 'Gemini requires items even when the source schema is open.',
                  items: { type: 'string' },
                },
              },
              required: ['files'],
            },
          },
        ],
      },
    ]);
  });

  it('rejects non-materialized image URLs to avoid leaking FileAsset URLs', () => {
    expect(() =>
      mapGatewayMessagesToGeminiContent([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: '/api/files/file_abc/preview' } }],
        },
      ]),
    ).toThrow('image dataUrl');
  });

  it('rejects non-materialized video and document URLs', () => {
    expect(() =>
      mapGatewayMessagesToGeminiContent([
        {
          role: 'user',
          content: [{ type: 'video_url', video_url: { url: '/api/files/file_abc/preview' } }],
        },
      ]),
    ).toThrow('dataUrl');

    expect(() =>
      mapGatewayMessagesToGeminiContent([
        {
          role: 'user',
          content: [{ type: 'document', document: { url: '/api/files/file_abc/download' } }],
        },
      ]),
    ).toThrow('dataUrl');
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
