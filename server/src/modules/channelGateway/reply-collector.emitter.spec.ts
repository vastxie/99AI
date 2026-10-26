import { ReplyCollectorEmitter } from './reply-collector.emitter';

declare const describe: any;
declare const expect: any;
declare const it: any;

const FILE_A = 'file_' + 'a'.repeat(24);
const FILE_B = 'file_' + 'b'.repeat(24);

describe('ReplyCollectorEmitter', () => {
  it('collects text deltas and final files, then resolves on agent.end', async () => {
    const emitter = new ReplyCollectorEmitter();
    emitter.emit({ type: 'agent.start', chatId: 77, data: {} } as any);
    emitter.emit({ type: 'message.delta', chatId: 77, data: { delta: 'Hel' } } as any);
    emitter.emit({ type: 'message.delta', chatId: 77, data: { delta: 'lo' } } as any);
    emitter.emit({
      type: 'tool.end',
      chatId: 77,
      data: {
        assets: [
          {
            fileId: FILE_A,
            role: 'final',
            displayName: 'out.pdf',
            mimeType: 'application/pdf',
            size: 12,
          },
          { fileId: FILE_B, role: 'intermediate' },
          { fileId: 'not-a-file' },
        ],
      },
    } as any);
    emitter.emit({ type: 'agent.end', chatId: 77, data: {} } as any);

    const reply = await emitter.done;
    expect(reply).toEqual({
      text: 'Hello',
      files: [
        {
          fileId: FILE_A,
          displayName: 'out.pdf',
          mimeType: 'application/pdf',
          size: 12,
          role: 'final',
        },
      ],
      chatId: 77,
    });
    emitter.emit({ type: 'message.delta', chatId: 77, data: { delta: ' late' } } as any);
    expect(emitter.finish().text).toBe('Hello');
  });

  it('records agent.error and allows a forced finish with a custom error', async () => {
    const failed = new ReplyCollectorEmitter();
    failed.emit({ type: 'agent.error', data: { code: 'E1', message: 'boom' } } as any);
    expect((await failed.done).error).toEqual({ code: 'E1', message: 'boom' });

    const forced = new ReplyCollectorEmitter();
    forced.emit({ type: 'message.delta', data: { delta: 'partial' } } as any);
    expect(forced.finish({ code: 'CHANNEL_TIMEOUT', message: 'timeout' })).toEqual({
      text: 'partial',
      files: [],
      error: { code: 'CHANNEL_TIMEOUT', message: 'timeout' },
    });
  });

  it('keeps process notes out of the reply and honours a late phase correction', async () => {
    const emitter = new ReplyCollectorEmitter();
    emitter.emit({ type: 'message.delta', roundId: '0', data: { delta: '先查一下资料。' } } as any);
    emitter.emit({ type: 'message.phase', roundId: '0', data: { phase: 'process' } } as any);
    emitter.emit({ type: 'message.delta', roundId: '1', data: { delta: '结论：可行。' } } as any);
    emitter.emit({ type: 'message.phase', roundId: '1', data: { phase: 'process' } } as any);
    emitter.emit({ type: 'message.phase', roundId: '1', data: { phase: 'answer' } } as any);
    emitter.emit({ type: 'agent.end', data: {} } as any);
    expect((await emitter.done).text).toBe('结论：可行。');

    // 只有过程话术（例如达到轮次上限）：没有回复文字
    const truncated = new ReplyCollectorEmitter();
    truncated.emit({ type: 'message.delta', roundId: '0', data: { delta: '再搜一轮。' } } as any);
    truncated.emit({ type: 'message.phase', roundId: '0', data: { phase: 'process' } } as any);
    truncated.emit({ type: 'agent.end', data: {} } as any);
    expect((await truncated.done).text).toBe('');
  });

  it('prefers the terminal snapshot reply and sends only presented files in their order', async () => {
    const asset = (fileId: string, displayName: string) => ({
      fileId,
      role: 'final',
      displayName,
    });
    const emitter = new ReplyCollectorEmitter();
    emitter.emit({
      type: 'tool.end',
      roundId: '0',
      data: {
        type: 'tool',
        status: 'success',
        assets: [asset(FILE_A, 'clean.py'), asset(FILE_B, 'deck.pptx')],
      },
    } as any);
    emitter.emit({ type: 'message.delta', roundId: '1', data: { delta: '初稿完成。' } } as any);
    emitter.emit({
      type: 'tool.end',
      roundId: '1',
      data: {
        type: 'presentation',
        status: 'success',
        display: { json: { presentation: [{ fileId: FILE_B, caption: '终稿' }] } },
        assets: [asset(FILE_B, 'deck.pptx')],
      },
    } as any);
    emitter.emit({
      type: 'snapshot.sync',
      data: {
        reason: 'workflow_complete',
        finishReason: 'stop',
        content: '初稿完成。\n\n要哪种配色？\n1. 深色\n2. 浅色',
      },
    } as any);
    emitter.emit({ type: 'agent.end', data: {} } as any);
    const reply = await emitter.done;
    expect(reply.text).toBe('初稿完成。\n\n要哪种配色？\n1. 深色\n2. 浅色');
    expect(reply.files.map(file => file.fileId)).toEqual([FILE_B]);

    // 空清单：本次没有成果文件
    const none = new ReplyCollectorEmitter();
    none.emit({ type: 'tool.end', data: { assets: [asset(FILE_A, 'clean.py')] } } as any);
    none.emit({
      type: 'tool.end',
      data: { type: 'presentation', status: 'success', display: { json: { presentation: [] } } },
    } as any);
    none.emit({ type: 'agent.end', data: {} } as any);
    expect((await none.done).files).toEqual([]);
  });
});
