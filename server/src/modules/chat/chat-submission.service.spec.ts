import type { ChatProcessDto } from './dto/chatProcess.dto';
import { ChatSubmissionService } from './chat-submission.service';

declare const describe: any;
declare const expect: any;
declare const it: any;

const CONVERSATION_GID = 'g_0123456789abcdefghijklmn';

function fingerprint(body: Partial<ChatProcessDto>, overrides: Record<string, any> = {}): string {
  return new ChatSubmissionService().createFingerprint({
    operation: 'chat',
    conversationGid: CONVERSATION_GID,
    body: {
      prompt: 'hello',
      modelId: 7,
      model: 'gpt-test',
      reasoningEffort: 'medium',
      ...body,
    } as ChatProcessDto,
    ...overrides,
  }).digest;
}

describe('ChatSubmissionService canonical v1 envelope', () => {
  it('does not normalize double-encoded messages into the current message fingerprint', () => {
    const message = JSON.stringify({ role: 'user', content: 'hello' });
    expect(fingerprint({ message: JSON.stringify(message) })).not.toBe(fingerprint({ message }));
  });

  it('normalizes object field order and produces the same digest for the same payload', () => {
    const first = fingerprint({
      message: JSON.stringify({
        role: 'user',
        content: 'hello',
        metadata: { beta: 2, alpha: 1 },
      }),
      files: JSON.stringify([
        {
          fileId: 'file_abcdefghijklmnopqrstuvwx',
          type: 'image',
          name: 'diagram.png',
          mime: 'image/png',
          size: 42,
        },
      ]),
    });
    const second = fingerprint({
      files: JSON.stringify([
        {
          size: 42,
          mime: 'image/png',
          name: 'diagram.png',
          type: 'image',
          fileId: 'file_abcdefghijklmnopqrstuvwx',
        },
      ]),
      message: JSON.stringify({
        metadata: { alpha: 1, beta: 2 },
        content: 'hello',
        role: 'user',
      }),
    });

    expect(first).toBe(second);
    expect(fingerprint({ prompt: 'hello' })).toBe(fingerprint({ prompt: 'hello' }));
  });

  it.each([
    ['prompt', { prompt: 'different prompt' }, {}],
    ['model', { modelId: 8 }, {}],
    ['reasoning', { reasoningEffort: 'high' }, {}],
    ['attachment', { attachments: JSON.stringify([{ url: 'https://private/a.png' }]) }, {}],
    ['operation', {}, { operation: 'retry' }],
    ['parent turn', { parentTurnId: 'turn_other' }, {}],
    ['replaced turn', { replaceFromCid: 'c_0123456789abcdefghij' }, {}],
  ])('changes the digest when %s changes', (_label: string, body: any, overrides: any) => {
    expect(fingerprint(body, overrides)).not.toBe(fingerprint({}));
  });

  it('distinguishes replacements confirmed for different ranges', () => {
    const replace = { replaceFromCid: 'c_0123456789abcdefghij' };
    expect(fingerprint({ ...replace, replaceLaterTurns: 1 })).not.toBe(
      fingerprint({ ...replace, replaceLaterTurns: 3 }),
    );
    // 不替换时轮数不参与摘要
    expect(fingerprint({ replaceLaterTurns: 3 })).toBe(fingerprint({}));
  });

  it('keeps ordinary submissions on the same digest now that replaced turns are fingerprinted', () => {
    expect(fingerprint({ replaceFromCid: undefined })).toBe(fingerprint({}));
  });

  it('hashes URL-only identities without leaking private URLs and covers all three attachment fields', () => {
    const privateUrl = 'https://private.example/files/a.png?token=SECRET_TOKEN';
    const baseline = fingerprint({
      url: JSON.stringify([{ type: 'image', url: privateUrl }]),
      files: JSON.stringify([{ previewUrl: `${privateUrl}&source=files` }]),
      attachments: JSON.stringify([`${privateUrl}&source=attachments`]),
    });
    const changed = fingerprint({
      url: JSON.stringify([{ type: 'image', url: privateUrl }]),
      files: JSON.stringify([{ previewUrl: `${privateUrl}&source=files` }]),
      attachments: JSON.stringify([`${privateUrl}&source=changed`]),
    });

    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    expect(baseline).not.toContain('private.example');
    expect(baseline).not.toContain('SECRET_TOKEN');
    expect(changed).not.toBe(baseline);
  });

  it('preserves attachment order and multiplicity because both affect the persisted user message', () => {
    const item = {
      fileId: 'file_abcdefghijklmnopqrstuvwx',
      type: 'image',
      name: 'diagram.png',
    };
    expect(
      fingerprint({
        files: JSON.stringify([item, item]),
      }),
    ).not.toBe(
      fingerprint({
        files: JSON.stringify([item]),
      }),
    );
    expect(
      fingerprint({
        files: JSON.stringify([item]),
        attachments: JSON.stringify([item]),
      }),
    ).not.toBe(
      fingerprint({
        files: JSON.stringify([item, item]),
      }),
    );
  });
});
