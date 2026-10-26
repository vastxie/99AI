import { WeixinEmitter } from './weixin-emitter';
import { uploadMediaToCdn } from '../utils/weixin-media';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('../utils/weixin-media', () => {
  const actual = jest.requireActual('../utils/weixin-media');
  return {
    ...actual,
    uploadMediaToCdn: jest.fn(),
  };
});

async function flushQueue(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function createApiClient() {
  return {
    getConfig: jest.fn().mockResolvedValue({}),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendTyping: jest.fn().mockResolvedValue(undefined),
    getUploadUrl: jest.fn(),
  };
}

describe('WeixinEmitter FileAsset media', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends private runtime files by reading FileAsset instead of downloading URLs', async () => {
    const fileAssetService = {
      readFilesForRuntime: jest.fn().mockResolvedValue([
        {
          buffer: Buffer.from('private file'),
          name: 'report.pdf',
          originalName: 'report.pdf',
          fileId: 'file_1234567890abcdefABCDEF12',
          sourceRef: 'file_1234567890abcdefABCDEF12',
          sourceKind: 'file',
          ext: 'pdf',
          mime: 'application/pdf',
          size: 12,
        },
      ]),
    };
    const apiClient = createApiClient();
    (uploadMediaToCdn as any).mockResolvedValue({
      downloadEncryptedQueryParam: 'encrypted-param',
      aeskeyHex: '0123456789abcdef0123456789abcdef',
      fileSize: 16,
      fileSizeCiphertext: 32,
    });

    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
      ownerUserId: 7,
      fileAssetService: fileAssetService as any,
    });

    emitter.emit({
      type: 'tool.end',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      toolCallId: 'runtime_1',
      timestamp: Date.now(),
      data: {
        status: 'success',
        assets: [
          {
            role: 'final',
            displayName: 'report.pdf',
            fileId: 'file_1234567890abcdefABCDEF12',
            mimeType: 'application/pdf',
          },
        ],
      },
    });
    emitter.emit({
      type: 'agent.end',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { finishReason: 'stop' },
    });

    await flushQueue();

    expect(fileAssetService.readFilesForRuntime).toHaveBeenCalledWith({
      fileIds: ['file_1234567890abcdefABCDEF12'],
      userId: 7,
      maxFiles: 1,
      maxFileSizeMb: 100,
    });
    expect(uploadMediaToCdn).toHaveBeenCalledWith(
      expect.objectContaining({
        fileBuffer: Buffer.from('private file'),
        toUserId: 'wx-user',
      }),
    );
    expect(apiClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to_user_id: 'wx-user',
        context_token: 'ctx',
        item_list: [
          expect.objectContaining({
            type: 4,
            file_item: expect.objectContaining({ file_name: 'report.pdf', len: '16' }),
          }),
        ],
      }),
    );
  });

  it('flushes buffered AgentEvent text on agent.end', async () => {
    const apiClient = createApiClient();
    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
    });

    emitter.emit({
      type: 'message.delta',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { delta: '你好，' },
    });
    emitter.emit({
      type: 'message.delta',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { delta: '这是微信回复。' },
    });
    emitter.emit({
      type: 'agent.end',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { finishReason: 'stop' },
    });

    await flushQueue();

    expect(apiClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to_user_id: 'wx-user',
        context_token: 'ctx',
        item_list: [
          {
            type: 1,
            text_item: { text: '你好，这是微信回复。' },
          },
        ],
      }),
    );
  });

  it('extracts AgentEvent FileAsset media from tool.end assets', async () => {
    const fileAssetService = {
      readFilesForRuntime: jest.fn().mockResolvedValue([
        {
          buffer: Buffer.from('private image'),
          name: 'chart.png',
          originalName: 'chart.png',
          fileId: 'file_1234567890abcdefABCDEF12',
          sourceRef: 'file_1234567890abcdefABCDEF12',
          sourceKind: 'file',
          ext: 'png',
          mime: 'image/png',
          size: 13,
        },
      ]),
    };
    const apiClient = createApiClient();
    (uploadMediaToCdn as any).mockResolvedValue({
      downloadEncryptedQueryParam: 'encrypted-param',
      aeskeyHex: '0123456789abcdef0123456789abcdef',
      fileSize: 13,
      fileSizeCiphertext: 26,
    });

    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
      ownerUserId: 7,
      fileAssetService: fileAssetService as any,
    });

    emitter.emit({
      type: 'tool.end',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      toolCallId: 'tool_1',
      timestamp: Date.now(),
      data: {
        status: 'success',
        assets: [
          {
            fileId: 'file_1234567890abcdefABCDEF12',
            role: 'final',
            displayName: 'chart.png',
            mimeType: 'image/png',
          },
        ],
      },
    });
    emitter.emit({
      type: 'agent.end',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { finishReason: 'stop' },
    });

    await flushQueue();

    expect(fileAssetService.readFilesForRuntime).toHaveBeenCalledWith({
      fileIds: ['file_1234567890abcdefABCDEF12'],
      userId: 7,
      maxFiles: 1,
      maxFileSizeMb: 100,
    });
    expect(uploadMediaToCdn).toHaveBeenCalledWith(
      expect.objectContaining({
        fileBuffer: Buffer.from('private image'),
        toUserId: 'wx-user',
      }),
    );
    expect(apiClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        item_list: [
          expect.objectContaining({
            type: 2,
            image_item: expect.objectContaining({
              media: expect.objectContaining({
                encrypt_query_param: 'encrypted-param',
              }),
            }),
          }),
        ],
      }),
    );
  });

  it('flushes buffered AgentEvent text before sending an agent.error hint', async () => {
    const apiClient = createApiClient();
    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
    });

    emitter.emit({
      type: 'message.delta',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { delta: '已经生成的内容' },
    });
    emitter.emit({
      type: 'agent.error',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { code: 'runtime_error', message: '工具执行失败' },
    });

    await flushQueue();

    expect(apiClient.sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        item_list: [{ type: 1, text_item: { text: '已经生成的内容' } }],
      }),
    );
    expect(apiClient.sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        item_list: [{ type: 1, text_item: { text: '抱歉，处理时遇到了问题：工具执行失败' } }],
      }),
    );
  });

  it('keeps typing status updates non-blocking when Weixin rejects them', async () => {
    const apiClient = createApiClient();
    apiClient.getConfig.mockResolvedValue({ typing_ticket: 'typing-ticket' });
    apiClient.sendTyping.mockRejectedValue(new Error('typing failed'));
    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
    });

    await flushQueue();

    emitter.emit({
      type: 'message.delta',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { delta: '回复内容' },
    });
    emitter.emit({
      type: 'agent.end',
      chatId: 'cid-assistant',
      messageId: 'cid-assistant',
      timestamp: Date.now(),
      data: { finishReason: 'stop' },
    });

    await flushQueue();

    expect(apiClient.sendTyping).toHaveBeenCalledWith({
      ilink_user_id: 'wx-user',
      typing_ticket: 'typing-ticket',
      status: 1,
    });
    expect(apiClient.sendTyping).toHaveBeenCalledWith({
      ilink_user_id: 'wx-user',
      typing_ticket: 'typing-ticket',
      status: 2,
    });
    expect(apiClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        item_list: [{ type: 1, text_item: { text: '回复内容' } }],
      }),
    );
  });

  it('sends progress notes before tools, drops unexecuted process text, then presented files and the question', async () => {
    const fileA = 'file_' + 'a'.repeat(24);
    const fileB = 'file_' + 'b'.repeat(24);
    const fileAssetService = {
      readFilesForRuntime: jest.fn(async ({ fileIds }: any) => [
        { buffer: Buffer.from(fileIds[0]), name: fileIds[0], mime: 'application/pdf' },
      ]),
    };
    (uploadMediaToCdn as any).mockResolvedValue({
      downloadEncryptedQueryParam: 'encrypted-param',
      aeskeyHex: '0123456789abcdef0123456789abcdef',
      fileSize: 16,
      fileSizeCiphertext: 32,
    });
    const apiClient = createApiClient();
    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
      ownerUserId: 7,
      fileAssetService: fileAssetService as any,
    });
    const base = { chatId: 'cid', messageId: 'cid', timestamp: Date.now() };
    const asset = (fileId: string, displayName: string) => ({
      fileId,
      role: 'final',
      displayName,
      mimeType: 'application/pdf',
    });
    emitter.emit({
      ...base,
      type: 'message.delta',
      roundId: '0',
      data: { delta: '我先整理数据。' },
    });
    emitter.emit({ ...base, type: 'message.phase', roundId: '0', data: { phase: 'process' } });
    emitter.emit({ ...base, type: 'tool.start', roundId: '0', toolCallId: 't1', data: {} });
    emitter.emit({
      ...base,
      type: 'tool.end',
      roundId: '0',
      toolCallId: 't1',
      data: { status: 'success', assets: [asset(fileA, 'a.pdf'), asset(fileB, 'b.pdf')] },
    } as any);
    emitter.emit({ ...base, type: 'message.delta', roundId: '1', data: { delta: '整理完成。' } });
    emitter.emit({ ...base, type: 'tool.start', roundId: '1', toolCallId: 't2', data: {} });
    emitter.emit({
      ...base,
      type: 'tool.end',
      roundId: '1',
      toolCallId: 't2',
      data: {
        type: 'presentation',
        status: 'success',
        display: { json: { presentation: [{ fileId: fileB }] } },
        assets: [asset(fileB, 'b.pdf')],
      },
    } as any);
    emitter.emit({
      ...base,
      type: 'tool.end',
      roundId: '1',
      toolCallId: 't3',
      data: {
        type: 'question',
        status: 'success',
        display: { json: { question: { text: '要继续吗？', options: ['要', '不要'] } } },
      },
    } as any);
    // 一轮工具没执行就结束的过程话术（例如达到轮次上限）不发
    emitter.emit({ ...base, type: 'message.delta', roundId: '2', data: { delta: '再查一轮。' } });
    emitter.emit({ ...base, type: 'message.phase', roundId: '2', data: { phase: 'process' } });
    emitter.emit({ ...base, type: 'agent.end', data: { finishReason: 'stop' } });
    await flushQueue();
    await flushQueue();

    const sent = apiClient.sendMessage.mock.calls.map((call: any[]) => {
      const item = call[0].item_list[0];
      return item.type === 1 ? item.text_item.text : `file:${item.file_item?.file_name}`;
    });
    expect(sent).toEqual([
      '我先整理数据。',
      '整理完成。',
      `file:b.pdf`,
      '要继续吗？\n1. 要\n2. 不要',
    ]);
    expect(fileAssetService.readFilesForRuntime).toHaveBeenCalledTimes(1);
  });

  it('does not send an unexecuted progress note when the run fails before its tool starts', async () => {
    const apiClient = createApiClient();
    const emitter = new WeixinEmitter({
      toUserId: 'wx-user',
      contextToken: 'ctx',
      apiClient: apiClient as any,
    });
    const base = { chatId: 'cid', messageId: 'cid', timestamp: Date.now() };
    emitter.emit({
      ...base,
      type: 'message.delta',
      roundId: '0',
      data: { delta: '我现在执行数据清理。' },
    });
    emitter.emit({ ...base, type: 'message.phase', roundId: '0', data: { phase: 'process' } });
    emitter.emit({ ...base, type: 'agent.error', data: { code: 'E', message: '模型出错' } } as any);
    await flushQueue();
    const sent = apiClient.sendMessage.mock.calls.map(
      (call: any[]) => call[0].item_list[0].text_item.text,
    );
    expect(sent).toEqual(['抱歉，处理时遇到了问题：模型出错']);
  });
});
