import { normalizeModelHistory } from './history-normalizer';

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: any;

const config = {
  protocol: 'openai_chat_completions',
  model: 'deepseek-r1',
  apiKey: 'test',
  baseUrl: 'https://example.invalid',
};

describe('model history normalizer', () => {
  it('keeps complete tool groups, legalizes ids/names and synthesizes missing results', () => {
    const result = normalizeModelHistory(
      [
        { role: 'system', content: 'system' },
        {
          role: 'assistant',
          content: 'working',
          tool_calls: [
            { id: 'bad id', type: 'function', function: { name: 'bad.name', arguments: '{' } },
            { id: '', type: 'function', function: { name: 'second tool', arguments: '{}' } },
          ],
          reasoning_content: 'private history',
          provider_signature: 'must disappear',
        } as any,
        { role: 'tool', tool_call_id: 'bad id', content: 'known result', signature: 'drop' } as any,
        { role: 'user', content: 'next' },
      ],
      { config, supportedMediaTypes: ['image_url'] },
    );

    const assistant = result[1] as any;
    expect(assistant.tool_calls).toHaveLength(2);
    expect(assistant.tool_calls[0].id).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
    expect(assistant.tool_calls[0].function.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
    expect(assistant.tool_calls[0].function.arguments).toBe('{}');
    expect(assistant.reasoning_content).toBe('');
    expect(assistant).not.toHaveProperty('provider_signature');
    expect(result[2]).toMatchObject({
      role: 'tool',
      tool_call_id: assistant.tool_calls[0].id,
      content: 'known result',
    });
    expect(result[3]).toMatchObject({
      role: 'tool',
      tool_call_id: assistant.tool_calls[1].id,
      content: expect.stringContaining('结果缺失或中断'),
    });
    expect(result[4]).toEqual({ role: 'user', content: 'next' });
  });

  it('preserves only same-target current-run reasoning and strips private extras', () => {
    const result = normalizeModelHistory(
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
          ],
          reasoning_content: 'same model reasoning',
          __agent_context: {
            sourceModelIdentity: 'openai_chat_completions:deepseek-r1',
          },
          encrypted_content: 'drop',
        } as any,
        { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
      ],
      { config },
    );

    expect(result[0]).toMatchObject({ reasoning_content: 'same model reasoning' });
    expect(result[0]).not.toHaveProperty('encrypted_content');
    expect((result[0] as any).__agent_context.sourceModelIdentity).toBe(
      'openai_chat_completions:deepseek-r1',
    );
  });

  it('keeps the opaque provider state only for the same protocol and model or a sanitized run', () => {
    const state = { opaque: 'PRIVATE_PROVIDER_STATE' };
    const assistant = (extra: Record<string, unknown>) =>
      ({
        role: 'assistant',
        content: 'working',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
        ],
        provider_state: state,
        ...extra,
      }) as any;
    const normalize = (message: any, reasoningAlreadySanitized = false) =>
      normalizeModelHistory([message, { role: 'tool', tool_call_id: 'call_1', content: 'ok' }], {
        config,
        reasoningAlreadySanitized,
      })[0] as any;

    const same = normalize(
      assistant({
        __agent_context: { sourceModelIdentity: 'openai_chat_completions:deepseek-r1' },
      }),
    );
    // 原样携带（同一个对象），不复制、不解析
    expect(same.provider_state).toBe(state);
    expect(
      normalize(
        assistant({ __agent_context: { sourceModelIdentity: 'openai_chat_completions:other' } }),
      ),
    ).not.toHaveProperty('provider_state');
    expect(normalize(assistant({}))).not.toHaveProperty('provider_state');
    // 内部 Agent 路径已按来源身份清理过：第二次归一化与网关照常保留
    expect(normalize(assistant({}), true).provider_state).toBe(state);
    // 不是带工具调用的助手消息一律去掉
    const [user, answer] = normalizeModelHistory(
      [
        { role: 'user', content: 'hi', provider_state: state } as any,
        { role: 'assistant', content: 'final', provider_state: state } as any,
      ],
      { config, reasoningAlreadySanitized: true },
    );
    expect(user).not.toHaveProperty('provider_state');
    expect(answer).not.toHaveProperty('provider_state');
  });

  it('downgrades unsupported media visibly and preserves supported file refs without extras', () => {
    const result = normalizeModelHistory(
      [
        {
          role: 'user',
          content: [
            { type: 'image_file', file: { fileRef: 'attachment_1', name: 'a.png' }, secret: 'x' },
            { type: 'audio_file', file: { fileRef: 'attachment_2', name: 'a.mp3' } },
          ],
        },
      ],
      {
        config: { ...config, capabilities: { vision: true, audioInput: false } },
        supportedMediaTypes: ['image_url', 'audio_url'],
      },
    );

    expect(result[0].content).toEqual([
      {
        type: 'image_file',
        file: { fileRef: 'attachment_1', name: 'a.png' },
      },
      { type: 'text', text: '[历史音频未提供给当前模型。]' },
    ]);
  });

  it('turns orphan tool results into an explicit unknown observation', () => {
    expect(
      normalizeModelHistory([{ role: 'tool', tool_call_id: 'orphan', content: 'private' }], {
        config,
      }),
    ).toEqual([
      {
        role: 'user',
        content: '历史工具结果缺少可验证的调用关联，已按未知状态忽略。',
      },
    ]);
  });

  it('keeps repeated function names stable while making duplicate call ids unique', () => {
    const result = normalizeModelHistory(
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'duplicate', type: 'function', function: { name: 'same.tool', arguments: '{}' } },
            { id: 'duplicate', type: 'function', function: { name: 'same.tool', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'duplicate', content: 'first' },
        { role: 'tool', tool_call_id: 'duplicate', content: 'second' },
      ],
      { config },
    );

    const calls = (result[0] as any).tool_calls;
    expect(calls[0].id).not.toBe(calls[1].id);
    expect(calls[0].function.name).toBe(calls[1].function.name);
    expect(calls[0].function.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
    expect(result.slice(1).map(message => message.tool_call_id)).toEqual([
      calls[0].id,
      calls[1].id,
    ]);
  });

  it('keeps call ids globally unique and tool results round-local across the whole history', () => {
    const history: any[] = [
      {
        role: 'assistant',
        content: 'round one',
        tool_calls: [
          { id: 'same', type: 'function', function: { name: 'shared_tool', arguments: '{}' } },
          { id: '', type: 'function', function: { name: 'empty_one', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'same', content: 'r1-same' },
      { role: 'tool', tool_call_id: '', content: 'r1-empty' },
      { role: 'user', content: 'between one and two' },
      {
        role: 'assistant',
        content: 'round two',
        tool_calls: [
          { id: 'same', type: 'function', function: { name: 'different_tool', arguments: '{}' } },
          { id: 'bad id', type: 'function', function: { name: 'shared_tool', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'same', content: 'r2-same' },
      { role: 'tool', tool_call_id: 'bad id', content: 'r2-bad' },
      { role: 'tool', tool_call_id: 'orphan', content: 'must-not-be-associated' },
      {
        role: 'assistant',
        content: 'round three',
        tool_calls: [
          { id: 'same', type: 'function', function: { name: 'shared_tool', arguments: '{}' } },
          { id: 'same', type: 'function', function: { name: 'shared_tool', arguments: '{}' } },
          { id: '', type: 'function', function: { name: 'missing_tool', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'same', content: 'r3-first' },
      { role: 'tool', tool_call_id: 'same', content: 'r3-second' },
    ];

    const first = normalizeModelHistory(history, { config });
    const second = normalizeModelHistory(history, { config });
    const assistants = first.filter(message => message.role === 'assistant') as any[];
    const callIds = assistants.flatMap(message => message.tool_calls.map((call: any) => call.id));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(new Set(callIds).size).toBe(callIds.length);
    expect(callIds[0]).toBe('same');
    expect(assistants[0].tool_calls.map((call: any) => call.function.name)).toEqual([
      'shared_tool',
      'empty_one',
    ]);
    expect(assistants[1].tool_calls.map((call: any) => call.function.name)).toEqual([
      'different_tool',
      'shared_tool',
    ]);
    expect(assistants[2].tool_calls.map((call: any) => call.function.name)).toEqual([
      'shared_tool',
      'shared_tool',
      'missing_tool',
    ]);

    for (const assistant of assistants) {
      const assistantIndex = first.indexOf(assistant);
      const followingResults = first.slice(assistantIndex + 1).filter((message, index, tail) => {
        if (message.role !== 'tool') return false;
        return tail.slice(0, index).every(previous => previous.role === 'tool');
      });
      expect(followingResults.map(message => message.tool_call_id)).toEqual(
        assistant.tool_calls.map((call: any) => call.id),
      );
    }

    const contents = first
      .filter(message => message.role === 'tool')
      .map(message => message.content);
    expect(contents).toEqual([
      'r1-same',
      'r1-empty',
      'r2-same',
      'r2-bad',
      'r3-first',
      'r3-second',
      expect.stringContaining('结果缺失或中断'),
    ]);
    expect(first).toContainEqual({
      role: 'user',
      content: expect.stringContaining('缺少可验证的调用关联'),
    });
    expect(JSON.stringify(first)).not.toContain('must-not-be-associated');
  });

  it('downgrades media when a loaded protocol declares no multimodal types', () => {
    expect(
      normalizeModelHistory(
        [
          {
            role: 'user',
            content: [{ type: 'image_file', file: { fileRef: 'attachment_1' } }],
          },
        ],
        {
          config: { ...config, capabilities: { vision: true } },
          supportedMediaTypes: [],
        },
      ),
    ).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: '[历史图片未提供给当前模型。]' }],
      },
    ]);
  });
});
