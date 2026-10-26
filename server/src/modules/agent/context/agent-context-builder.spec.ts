import { AgentContextBuilder } from './agent-context-builder';
import { ModelMessageMapper } from './model-message-mapper';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('Agent Context Pipeline', () => {
  it('orders blocks and trims recent history after file blocks', () => {
    const builder = new AgentContextBuilder();
    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份' },
        { role: 'user', content: '旧问题 '.repeat(1200) },
        { role: 'assistant', content: '旧回答 '.repeat(1200) },
        { role: 'user', content: '当前请求' },
      ],
      platformPolicy: '[运行时上下文]\n- 当前时间: 2026/05/29 10:00',
      fileRefMapping: {
        counters: { attachment: 1, output_image: 0, output_file: 0, previous_file: 0 },
        entries: [
          {
            fileRef: 'attachment_1',
            fileId: 'file_abcdefghijklmnopqrstuvwx',
            name: 'source.png',
            mime: 'image/png',
            type: 'image',
            origin: 'user_upload',
          },
        ],
      },
      queuedTurn: {
        parentTurnId: 'turn_parent',
        prompt: '接着处理第二张图',
        channel: 'web',
        createdAt: 1770000000000,
      },
      previousToolResults: [
        { name: '搜索', status: 'success', model: { content: '搜索结果摘要' } },
      ],
      maxTokens: 620,
    });

    expect(result.blocks.map(block => block.type)).toEqual([
      'system_identity',
      'platform_policy',
      'current_user_request',
      'explicit_file_reference',
      'queued_turn',
      'recent_history',
      'previous_tool_result',
    ]);

    const includedTypes = result.blocks
      .filter(block => block.included !== false)
      .map(block => block.type);
    expect(includedTypes).toEqual(
      expect.arrayContaining(['current_user_request', 'explicit_file_reference']),
    );
    const historyBlock = result.blocks.find(block => block.type === 'recent_history');
    const queuedTurnBlock = result.blocks.find(block => block.type === 'queued_turn');
    expect(JSON.stringify(queuedTurnBlock?.content)).toContain('用户追加请求：接着处理第二张图');
    expect(JSON.stringify(queuedTurnBlock?.content)).not.toContain('parentTurnId');
    expect(JSON.stringify(queuedTurnBlock?.content)).not.toContain('channel=');
    expect(JSON.stringify(queuedTurnBlock?.content)).not.toContain('createdAt');
    expect(['truncated', 'dropped_budget_exhausted']).toContain(historyBlock?.reason);
    expect(historyBlock?.truncated || historyBlock?.included === false).toBe(true);
    expect(historyBlock?.estimatedTokens).toEqual(expect.any(Number));
    expect(result.manifest.blocks.every(block => typeof block.truncated === 'boolean')).toBe(true);
  });

  it('keeps the current user request while applying a deterministic recent history window', () => {
    const builder = new AgentContextBuilder();
    const mapper = new ModelMessageMapper();
    const oldMessages = Array.from({ length: 18 }).flatMap((_, index) => [
      { role: 'user' as const, content: `old user ${index} ${'x'.repeat(120)}` },
      { role: 'assistant' as const, content: `old assistant ${index} ${'y'.repeat(120)}` },
    ]);

    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份' },
        ...oldMessages,
        { role: 'user', content: 'CURRENT_USER_MESSAGE_MUST_STAY' },
      ],
      maxTokens: 900,
    });

    const modelMessages = mapper.toModelMessages(result);
    const serializedModelMessages = JSON.stringify(modelMessages);
    const historyBlock = result.manifest.blocks.find(block => block.type === 'recent_history');
    const currentBlock = result.manifest.blocks.find(
      block => block.type === 'current_user_request',
    );

    expect(serializedModelMessages).toContain('CURRENT_USER_MESSAGE_MUST_STAY');
    expect(serializedModelMessages).not.toContain('old user 0');
    expect(historyBlock).toMatchObject({
      included: true,
      reason: 'truncated',
      truncated: true,
      estimatedTokens: expect.any(Number),
    });
    expect(currentBlock).toMatchObject({
      included: true,
      reason: 'included_required',
      truncated: false,
      estimatedTokens: expect.any(Number),
    });
  });

  it('uses the explicit required user as the current request instead of an implicit last-user guess', () => {
    const builder = new AgentContextBuilder();
    const mapper = new ModelMessageMapper();
    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份' },
        { role: 'user', content: '旧问题' },
        { role: 'assistant', content: '旧回答' },
        {
          role: 'user',
          content: 'EXPLICIT_CURRENT_REQUEST',
          __agent_context: { chatLogId: 12, required: true },
        } as any,
        { role: 'assistant', content: '本轮前不应出现的占位消息' },
      ],
    });

    const currentBlock = result.blocks.find(block => block.type === 'current_user_request');
    const historyBlock = result.blocks.find(block => block.type === 'recent_history');
    const modelMessages = mapper.toModelMessages(result);

    expect(String(currentBlock?.content)).toContain('EXPLICIT_CURRENT_REQUEST');
    expect(JSON.stringify(historyBlock?.content)).not.toContain('EXPLICIT_CURRENT_REQUEST');
    expect(modelMessages.at(-1)?.content).toContain('EXPLICIT_CURRENT_REQUEST');
  });

  it('fails closed for duplicate explicit current users or a historical user after current', () => {
    const builder = new AgentContextBuilder();

    expect(() =>
      builder.build({
        messages: [
          {
            role: 'user',
            content: 'current one',
            __agent_context: { chatLogId: 11, required: true },
          } as any,
          {
            role: 'user',
            content: 'current two',
            __agent_context: { chatLogId: 12, required: true },
          } as any,
        ],
      }),
    ).toThrow(/multiple current user requests/);
    expect(() =>
      builder.build({
        messages: [
          {
            role: 'user',
            content: 'explicit current',
            __agent_context: { chatLogId: 12, required: true },
          } as any,
          { role: 'user', content: 'older user placed after current' },
        ],
      }),
    ).toThrow(/historical user request after the current request/);
  });

  it('does not apply a fixed small message-count cap when recent history budget allows more', () => {
    const builder = new AgentContextBuilder();
    const oldMessages = Array.from({ length: 18 }).flatMap((_, index) => [
      { role: 'user' as const, content: `old user ${index}` },
      { role: 'assistant' as const, content: `old assistant ${index}` },
    ]);

    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份' },
        ...oldMessages,
        { role: 'user', content: 'CURRENT_USER_MESSAGE_MUST_STAY' },
      ],
      maxTokens: 64000,
    });

    const historyBlock = result.blocks.find(block => block.type === 'recent_history');
    expect(historyBlock?.metadata?.modelMessages?.length).toBe(36);
    expect(historyBlock).toMatchObject({
      included: true,
      reason: 'included_within_budget',
    });
    expect(historyBlock?.truncated).toBeUndefined();
  });

  it('keeps manifest metadata free of source content and sensitive file identifiers', () => {
    const builder = new AgentContextBuilder();
    const result = builder.build({
      messages: [{ role: 'user', content: '处理文件' }],
      platformPolicy: '不要泄漏这段策略正文 apiKey=SECRET /Users/example/private.txt',
      fileRefMapping: {
        counters: { attachment: 1, output_image: 0, output_file: 0, previous_file: 0 },
        entries: [
          {
            fileRef: 'attachment_1',
            fileId: 'file_sensitivefileidentifier',
            name: 'private.pdf',
            mime: 'application/pdf',
          },
        ],
      },
    });

    const serializedManifest = JSON.stringify(result.manifest);
    expect(serializedManifest).toContain('platform_policy');
    expect(serializedManifest).toContain('explicit_file_reference');
    expect(serializedManifest).not.toContain('不要泄漏这段策略正文');
    expect(serializedManifest).not.toContain('SECRET');
    expect(serializedManifest).not.toContain('/Users/example');
    expect(serializedManifest).not.toContain('file_sensitivefileidentifier');
  });

  it('keeps explicit file references explainable instead of silently dropping them', () => {
    const builder = new AgentContextBuilder();
    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份 '.repeat(40) },
        { role: 'user', content: '当前请求 '.repeat(40) },
      ],
      fileRefMapping: {
        counters: { attachment: 1, output_image: 0, output_file: 0, previous_file: 0 },
        entries: [
          {
            fileRef: 'attachment_1',
            fileId: 'file_sensitivefileidentifier',
            name: '/Users/example/Secrets/source.pdf',
            mime: 'application/pdf',
            type: 'document',
            origin: 'user_upload',
          },
        ],
      },
      maxTokens: 40,
    });

    const fileBlock = result.manifest.blocks.find(
      block => block.type === 'explicit_file_reference',
    );
    expect(fileBlock).toMatchObject({
      included: false,
      reason: 'manifest_only_budget_exhausted',
      truncated: false,
      estimatedTokens: expect.any(Number),
    });
    const serializedManifest = JSON.stringify(result.manifest);
    expect(serializedManifest).toContain('explicit_file_reference');
    expect(serializedManifest).not.toContain('/Users/example');
    expect(serializedManifest).not.toContain('file_sensitivefileidentifier');
  });

  it('maps blocks to ModelGateway messages while appending supplemental context in fixed order', () => {
    const builder = new AgentContextBuilder();
    const mapper = new ModelMessageMapper();
    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份' },
        { role: 'user', content: '上一轮问题' },
        { role: 'assistant', content: '上一轮回答' },
        { role: 'user', content: '请总结这个文件' },
      ],
      fileRefMapping: {
        counters: { attachment: 1, output_image: 0, output_file: 0, previous_file: 0 },
        entries: [
          {
            fileRef: 'attachment_1',
            fileId: 'file_abcdefghijklmnopqrstuvwx',
            name: 'brief.md',
            mime: 'text/markdown',
          },
        ],
      },
      previousToolResults: [{ role: 'tool', content: '工具观察：上一轮结果' }],
    });

    const messages = mapper.toModelMessages(result);
    expect(messages.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user']);

    const currentUserContent = String(messages[messages.length - 1].content);
    expect(currentUserContent).toContain('请总结这个文件');
    expect(currentUserContent).toContain('fileRef=attachment_1');
    expect(currentUserContent).toContain('工具观察：上一轮结果');
    expect(currentUserContent.indexOf('fileRef=attachment_1')).toBeLessThan(
      currentUserContent.indexOf('工具观察：上一轮结果'),
    );
  });

  it('records a degraded platform policy block without injecting empty content', () => {
    const builder = new AgentContextBuilder();
    const mapper = new ModelMessageMapper();
    const result = builder.build({
      messages: [{ role: 'user', content: '当前请求' }],
      platformPolicy: { warning: 'runtime_context_unavailable:timeout' },
    });

    const policyBlock = result.blocks.find(block => block.type === 'platform_policy');
    expect(policyBlock).toMatchObject({
      included: false,
      reason: 'degraded_unavailable',
    });
    expect(result.manifest.warnings).toEqual(
      expect.arrayContaining(['runtime_context_unavailable:timeout']),
    );
    expect(JSON.stringify(mapper.toModelMessages(result))).not.toContain(
      'runtime_context_unavailable',
    );
  });

  it('reports token budget warnings and exhausted total budget deterministically', () => {
    const builder = new AgentContextBuilder();
    const result = builder.build({
      messages: [
        { role: 'system', content: '系统身份 '.repeat(80) },
        { role: 'user', content: 'CURRENT_MESSAGE_STILL_INCLUDED '.repeat(80) },
      ],
      platformPolicy: '[运行时上下文]\n' + '策略正文 '.repeat(120),
      previousToolResults: [{ role: 'tool', content: '工具结果 '.repeat(120) }],
      maxTokens: 120,
    });

    expect(JSON.stringify(result.blocks)).toContain('CURRENT_MESSAGE_STILL_INCLUDED');
    expect(result.manifest.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('context_token_budget_warning'),
        expect.stringContaining('context_token_budget_exhausted'),
      ]),
    );
    expect(
      result.manifest.blocks.some(
        block =>
          block.reason === 'dropped_budget_exhausted' ||
          block.reason === 'manifest_only_budget_exhausted',
      ),
    ).toBe(true);
  });

  it('sanitizes manifest block warnings and top-level warnings', () => {
    const builder = new AgentContextBuilder();
    const result = builder.build({
      messages: [{ role: 'user', content: '当前请求' }],
      platformPolicy: {
        warning:
          'runtime_context_unavailable:apiKey=SECRET baseUrl=https://provider.example stdout: leaked-output /Users/example/private.log',
      },
    });

    const serializedManifest = JSON.stringify(result.manifest);
    const serializedWarnings = JSON.stringify(result.warnings);

    for (const serialized of [serializedManifest, serializedWarnings]) {
      expect(serialized).toContain('[已脱敏]');
      expect(serialized).not.toContain('apiKey=SECRET');
      expect(serialized).not.toContain('https://provider.example');
      expect(serialized).not.toContain('leaked-output');
      expect(serialized).not.toContain('/Users/example');
    }
  });
});
