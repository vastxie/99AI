import {
  assertAgentOperationIdentity,
  fingerprintModelIntent,
  normalizeToolIntent,
  operationIdFromTurnId,
  parseModelEffectCheckpoint,
  parseStoredToolOutcome,
  sanitizeOperationLedgerText,
} from './operation-ledger.types';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('operation ledger durable payloads', () => {
  it('derives server-owned operation IDs and validates every persisted binding', () => {
    expect(operationIdFromTurnId('turn_fixture_1')).toBe('op_turn_fixture_1');
    expect(() => operationIdFromTurnId('../turn_fixture')).toThrow(/turn/u);
    expect(() =>
      assertAgentOperationIdentity({
        operationId: 'op_turn_fixture_1',
        ownerType: 'user',
        ownerKey: '7',
        groupId: 1,
        userLogId: 2,
        assistantLogId: 3,
        turnId: 'turn_fixture_1',
        modelKeyId: 0,
      }),
    ).toThrow(/model key/u);
  });

  it.each([
    ['credential', 'payload apiKey: SYNTHETIC_SECRET_VALUE', '[sensitive content omitted]'],
    ['url', 'result https://private.example.test/file', 'result [URL omitted]'],
    ['posix path', 'saved /Users/example/private.txt', 'saved [path omitted]'],
    ['windows path', 'saved C:\\private\\file.txt', 'saved [path omitted]'],
    ['data url', 'image data:image/png;base64,AAAA', 'image [data omitted]'],
  ])('sanitizes %s from bounded checkpoints', (_label: string, input: string, expected: string) => {
    expect(sanitizeOperationLedgerText(input)).toBe(expected);
  });

  it.each([
    '密码：SYNTHETIC_VALUE_1234567890',
    '说明：「访问令牌」∶「SYNTHETIC_VALUE_1234567890」',
    'credential = SYNTHETIC_VALUE_1234567890',
  ])('omits credential-shaped recovery text: %s', (value: string) => {
    expect(sanitizeOperationLedgerText(value)).toBe('[sensitive content omitted]');
  });

  it.each([
    '/usr/local/private.txt',
    '/mnt/private.txt',
    '\\\\server\\private.txt',
    '结果保存于/Users/example/private/report.txt',
    'saved /custom-root/private/report.txt',
    'prefix/Users/example/private/report.txt',
  ])('removes an absolute host path from recovery text: %s', (value: string) => {
    const sanitized = sanitizeOperationLedgerText(value.startsWith('/') ? `位置：${value}` : value);
    const rawPath = value.includes('/') ? value.slice(value.indexOf('/')) : value;
    expect(sanitized).toContain('[path omitted]');
    expect(sanitized).not.toContain(rawPath);
  });

  it.each([
    '比例 a/b 与 1 / 2',
    '相对路径 docs/reference/file.md',
    '相对路径 ./docs/reference.md 与 ../fixtures/input.json',
    '稳定引用 fileRef=attachment_1',
    '逻辑关系 和/或 与单位 km/h',
    '变量 a/b/c 与标签 prefix/custom/value',
  ])('keeps relative or non-path slash text: %s', (value: string) => {
    expect(sanitizeOperationLedgerText(value)).toBe(value);
  });

  it.each([
    '结果保存于/Users/example/private/report.txt',
    'saved /custom-root/private/report.txt',
    'prefix/Users/example/private/report.txt',
  ])('sanitizes every durable model/tool text field: %s', (value: string) => {
    const checkpoint = parseModelEffectCheckpoint({
      textTail: value,
      textChars: value.length,
      reasoningChars: 0,
    });
    const outcome = parseStoredToolOutcome({
      callId: 'call_path',
      toolName: 'ls',
      displayName: value,
      status: 'success',
      modelContent: value,
      inputSummary: value,
      toolCost: 0,
    });
    const serialized = JSON.stringify({ checkpoint, outcome });

    expect(serialized).toContain('[path omitted]');
    expect(serialized).not.toContain(value.slice(value.indexOf('/')));
  });

  it('stores only normalized safe replay payloads and rejects secrets or host locations', () => {
    const normalized = normalizeToolIntent({
      roundIndex: 1,
      ordinal: 2,
      callId: 'call_1',
      toolName: 'ls',
      replayPolicy: 'safe',
      replayPayload: { path: 'out/result', recursive: false },
      inputShape: { path: 'string', recursive: 'boolean' },
    });
    expect(JSON.parse(normalized.serializedPayload!)).toEqual({
      path: 'out/result',
      recursive: false,
    });
    expect(normalized.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(() =>
      normalizeToolIntent({
        roundIndex: 0,
        ordinal: 0,
        callId: 'call_secret',
        toolName: 'ls',
        replayPolicy: 'safe',
        replayPayload: { path: 'x', apiKey: 'SYNTHETIC_SECRET_VALUE' },
        inputShape: { path: 'string', apiKey: 'string' },
      }),
    ).toThrow(/durable-safe/u);
    expect(() =>
      normalizeToolIntent({
        roundIndex: 0,
        ordinal: 0,
        callId: 'call_path',
        toolName: 'ls',
        replayPolicy: 'safe',
        replayPayload: { path: '/Users/example/private' },
        inputShape: { path: 'string' },
      }),
    ).toThrow(/forbidden location/u);
    expect(() =>
      normalizeToolIntent({
        roundIndex: 0,
        ordinal: 0,
        callId: 'call_workspace_path',
        toolName: 'ls',
        replayPolicy: 'safe',
        replayPayload: { path: '/workspace/private' },
        inputShape: { path: 'string' },
      }),
    ).toThrow(/forbidden location/u);
    expect(() =>
      normalizeToolIntent({
        roundIndex: 0,
        ordinal: 0,
        callId: 'call_unknown_root',
        toolName: 'ls',
        replayPolicy: 'safe',
        replayPayload: { path: '/unknown-root/private' },
        inputShape: { path: 'string' },
      }),
    ).toThrow(/forbidden location/u);
  });

  it('fingerprints only the bounded request shape and rejects malformed shape hashes', () => {
    const base = {
      roundIndex: 0,
      attemptIndex: 0,
      messageCount: 2,
      toolNames: ['ls'],
      providerPayloadChars: 100,
      requestShapeHash: 'a'.repeat(64),
    };
    expect(fingerprintModelIntent(base)).not.toBe(
      fingerprintModelIntent({ ...base, requestShapeHash: 'b'.repeat(64) }),
    );
    expect(() => fingerprintModelIntent({ ...base, requestShapeHash: 'raw prompt' })).toThrow(
      /shape hash/u,
    );
  });

  it('strictly parses bounded model checkpoints and tool outcomes', () => {
    expect(
      parseModelEffectCheckpoint({
        textTail: 'tail',
        textChars: 4,
        reasoningChars: 0,
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      }),
    ).toMatchObject({ textTail: 'tail', textChars: 4, usage: { totalTokens: 5 } });
    expect(() => parseModelEffectCheckpoint({ textChars: -1, reasoningChars: 0 })).toThrow(
      /text count/u,
    );
    expect(
      parseStoredToolOutcome({
        callId: 'call_1',
        toolName: 'ls',
        displayName: 'List',
        status: 'success',
        modelContent: 'ok',
        toolCost: 0,
      }),
    ).toMatchObject({ callId: 'call_1', status: 'success', modelContent: 'ok' });
    expect(() =>
      parseStoredToolOutcome({
        callId: 'call_1',
        toolName: 'ls',
        displayName: 'List',
        status: 'success',
        modelContent: 'ok',
        toolCost: 0,
        rawArguments: { path: 'private' },
      }),
    ).toThrow(/outcome/u);
  });
});
