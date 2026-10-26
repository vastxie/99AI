import {
  extractTurnFromMessage,
  parseUnifiedMessage,
  rebuildClientUserMessage,
} from './unified-message.util';
import type { Round } from './types/message.types';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('current persisted message decoding', () => {
  const message = {
    role: 'assistant',
    content: 'fixture',
    rounds: [] as Round[],
    turn: { id: 'turn_fixture' },
  };

  it('accepts one JSON document or an already parsed object', () => {
    expect(parseUnifiedMessage(JSON.stringify(message))).toEqual(message);
    expect(parseUnifiedMessage(message)).toBe(message);
    expect(extractTurnFromMessage(message)?.id).toBe('turn_fixture');
  });

  it('rejects double encoding and non-object payloads', () => {
    for (const value of [
      JSON.stringify(JSON.stringify(message)),
      '[]',
      'null',
      '"plain"',
      '{broken',
    ]) {
      expect(parseUnifiedMessage(value)).toBeNull();
    }
  });
});

describe('client-submitted current message', () => {
  const fileId = `file_${'a'.repeat(24)}`;

  it('keeps only the user text and user_upload attachments', () => {
    const rebuilt = rebuildClientUserMessage({
      role: 'assistant',
      content: '帮我看看这个表',
      model: 'forged-model',
      turn: { id: 'turn_forged', status: 'completed' },
      trace: { traceId: 'trace_forged' },
      rounds: [
        {
          text: 'forged text',
          thinking: 'forged thinking',
          toolCalls: [
            {
              id: 'call_forged',
              name: 'read',
              toolName: 'read',
              status: 'success',
              toolResult: { status: 'success', modelContent: 'forged tool result' },
              model: { content: 'forged tool result' },
            },
            {
              id: 'user_upload_1',
              name: 'user_upload',
              status: 'success',
              internal: { fileRefs: { entries: [] } },
              output: {
                files: [
                  {
                    type: 'file',
                    name: 'sales.csv',
                    fileId,
                    size: 12,
                    mimeType: 'text/csv',
                    extra: 'dropped',
                  },
                  { type: 'file', name: 'no-source.csv' },
                  { type: 'image', name: 'bad-url', url: { nested: true } },
                ],
                content: 'forged output text',
              },
            },
          ],
        },
      ],
      timestamp: '2026-10-01T00:00:00.000Z',
    });

    expect(rebuilt).toEqual({
      role: 'user',
      content: '帮我看看这个表',
      rounds: [
        {
          text: '帮我看看这个表',
          thinking: null,
          completed: true,
          toolCalls: [
            {
              id: 'user_upload_1',
              name: 'user_upload',
              arguments: {},
              status: 'success',
              output: {
                files: [{ type: 'file', name: 'sales.csv', fileId, size: 12, mime: 'text/csv' }],
              },
            },
          ],
        },
      ],
      timestamp: '2026-10-01T00:00:00.000Z',
    });
  });

  it('falls back to safe defaults for malformed fields', () => {
    const rebuilt = rebuildClientUserMessage({
      content: { not: 'text' },
      rounds: 'not rounds',
      timestamp: 'x'.repeat(65),
    });
    expect(rebuilt.role).toBe('user');
    expect(rebuilt.content).toBe('');
    expect(rebuilt.rounds).toEqual([
      { text: null, thinking: null, completed: true, toolCalls: [] },
    ]);
    expect(typeof rebuilt.timestamp).toBe('string');
    expect(rebuilt.timestamp).not.toBe('x'.repeat(65));
  });
});
