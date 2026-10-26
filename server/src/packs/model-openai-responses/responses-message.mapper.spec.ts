import {
  mapGatewayMessagesToResponsesInput,
  mapOpenAIChatToolsToResponsesTools,
} from './responses-message.mapper';
import { normalizeModelHistory } from '@/modules/modelGateway/model-stream';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('responses-message.mapper', () => {
  it('maps tool images into native function_call_output while explaining unsupported audio', () => {
    const result = mapGatewayMessagesToResponsesInput([
      {
        role: 'tool',
        tool_call_id: 'a',
        content: [
          { type: 'text', text: 'chart' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
          { type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'wav' } },
        ],
      },
    ] as any);
    expect(result.input[0]).toMatchObject({
      type: 'function_call_output',
      call_id: 'a',
      output: [
        { type: 'input_text', text: 'chart' },
        { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
        { type: 'input_text', text: expect.stringContaining('不支持') },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('YXVkaW8=');
  });
  it('maps gateway messages to stateless Responses input items', () => {
    const mapped = mapGatewayMessagesToResponsesInput([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      {
        role: 'assistant',
        content: null,
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
      instructions: 'You are helpful.',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'search',
          arguments: '{"q":"docs"}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'result text',
        },
      ],
    });
  });

  it('preserves globally normalized call/result ids across repeated tool rounds', () => {
    const normalized = normalizeModelHistory(repeatedCallIdHistory() as any, {
      config: historyConfig('openai_responses'),
    });
    const mapped = mapGatewayMessagesToResponsesInput(normalized as any);
    const calls = mapped.input.filter(item => item.type === 'function_call');
    const results = mapped.input.filter(item => item.type === 'function_call_output');

    expect(calls.map(item => item.call_id)).toHaveLength(2);
    expect(new Set(calls.map(item => item.call_id)).size).toBe(2);
    expect(results.map(item => item.call_id)).toEqual(calls.map(item => item.call_id));
    expect(results.map(item => item.output)).toEqual(['first result', 'second result']);
  });

  it('maps OpenAI chat function tools without enabling built-in tools', () => {
    expect(
      mapOpenAIChatToolsToResponsesTools([
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search docs',
            parameters: { type: 'object' },
          },
        },
      ] as any),
    ).toEqual([
      {
        type: 'function',
        name: 'search',
        description: 'Search docs',
        parameters: { type: 'object' },
        strict: null,
      },
    ]);

    expect(() => mapOpenAIChatToolsToResponsesTools([{ type: 'web_search' }] as any)).toThrow(
      '仅支持 function tools',
    );
  });

  it('keeps assistant text before tool calls in Responses history', () => {
    const mapped = mapGatewayMessagesToResponsesInput([
      {
        role: 'assistant',
        content: '我先查一下资料。',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"model gateway"}' },
          },
        ],
      },
    ]);

    expect(mapped.input).toEqual([
      { role: 'assistant', content: '我先查一下资料。' },
      {
        type: 'function_call',
        call_id: 'call_2',
        name: 'search',
        arguments: '{"q":"model gateway"}',
      },
    ]);
  });

  it('maps video_url content parts to Responses input_video', () => {
    const mapped = mapGatewayMessagesToResponsesInput([
      {
        role: 'user',
        content: [
          { type: 'text', text: '请看这个视频。' },
          {
            type: 'video_url',
            video_url: { url: 'data:video/mp4;base64,dmlkZW8=' },
          },
        ],
      },
    ]);

    expect(mapped.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: '请看这个视频。' },
          {
            type: 'input_video',
            video_url: 'data:video/mp4;base64,dmlkZW8=',
          },
        ],
      },
    ]);
  });

  it('maps document and audio base64 content parts to Responses inputs', () => {
    const mapped = mapGatewayMessagesToResponsesInput([
      {
        role: 'user',
        content: [
          { type: 'text', text: '请分析这个文件和音频。' },
          {
            type: 'document',
            document: {
              name: 'report.pdf',
              mime: 'application/pdf',
              data: 'data:application/pdf;base64,cGRm',
            },
          },
          {
            type: 'input_audio',
            input_audio: {
              data: 'YXVkaW8=',
              format: 'wav',
              mime: 'audio/wav',
            },
          },
        ],
      },
    ]);

    expect(mapped.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: '请分析这个文件和音频。' },
          {
            type: 'input_file',
            filename: 'report.pdf',
            file_data: 'data:application/pdf;base64,cGRm',
          },
          {
            type: 'input_audio',
            audio_url: 'data:audio/wav;base64,YXVkaW8=',
          },
        ],
      },
    ]);
  });

  it('wraps raw document and audio base64 content parts as Responses data URLs', () => {
    const mapped = mapGatewayMessagesToResponsesInput([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            document: {
              filename: 'report.pdf',
              mime: 'application/pdf',
              data: 'cGRm',
            },
          },
          {
            type: 'input_audio',
            input_audio: {
              data: 'YXVkaW8=',
              format: 'mp3',
            },
          },
        ],
      },
    ]);

    expect(mapped.input).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: 'report.pdf',
            file_data: 'data:application/pdf;base64,cGRm',
          },
          {
            type: 'input_audio',
            audio_url: 'data:audio/mpeg;base64,YXVkaW8=',
          },
        ],
      },
    ]);
  });

  it('rejects non-base64 document and audio payloads for Responses', () => {
    expect(() =>
      mapGatewayMessagesToResponsesInput([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: 'https://example.com/audio.wav',
                format: 'wav',
              },
            },
          ],
        },
      ]),
    ).toThrow('仅支持 base64 或 dataUrl');

    expect(() =>
      mapGatewayMessagesToResponsesInput([
        {
          role: 'user',
          content: [
            {
              type: 'document',
              document: {
                name: 'report.pdf',
                data: 'https://example.com/report.pdf',
              },
            },
          ],
        },
      ]),
    ).toThrow('仅支持 base64 或 dataUrl');
  });

  it('rejects non-PDF document data URLs for Responses input_file', () => {
    expect(() =>
      mapGatewayMessagesToResponsesInput([
        {
          role: 'user',
          content: [
            {
              type: 'document',
              document: {
                name: 'report.docx',
                mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                data: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBA==',
              },
            },
          ],
        },
      ]),
    ).toThrow('文件输入仅支持 PDF');
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
