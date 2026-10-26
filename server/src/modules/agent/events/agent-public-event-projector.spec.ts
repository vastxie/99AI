import {
  projectInternalAgentEventToPublic,
  sanitizeAgentEventForFrontend,
} from './agent-public-event-projector';
import type { ToolCall } from '../../chatLog/types/message.types';
import { findPresentedFiles, findQuestion } from '@99agent/contracts';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import {
  OWNER_FRONTEND_MESSAGE_OPTIONS,
  stringifyFrontendMessage,
  toBackendToolCall,
} from '../../chatLog/tool-result-payload';
import { ConversationToolProvider } from '../conversation/conversation-tool.provider';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('AgentEvent contract', () => {
  it('keeps public events JSON serializable and free of internal diagnostics', () => {
    const event = projectInternalAgentEventToPublic({
      type: 'tool.end',
      chatId: 123,
      messageId: 'cid_1',
      taskId: 'task_1',
      conversationGid: 'g_0123456789abcdefghijklmn',
      turnId: 'turn_1',
      roundId: 0,
      toolCallId: 'tool_1',
      timestamp: 1710000000000,
      data: {
        name: 'runtime',
        status: 'success',
        display: {
          title: '执行完成',
          summary: '已生成文件',
          stdout: 'STDOUT_SECRET',
        },
        assets: [
          {
            fileId: 'file_public',
            role: 'final',
            displayName: 'report.md',
          },
        ],
        rawPayload: {
          apiKey: 'SECRET_API_KEY',
          baseUrl: 'https://provider.example.com',
        },
        contextManifest: {
          blocks: [{ type: 'platform_policy', warning: 'apiKey=SECRET_CONTEXT_KEY' }],
        },
        privatePath: '/Users/example/private/report.md',
        toolCall: {
          trace: {
            code: 'RUNTIME_FAILED',
            message: 'Runtime failed',
            diagnostics: {
              runtimeLog: 'raw runtime log Bearer LOG_SECRET',
              stdout: 'STDOUT_SECRET',
            },
          },
        },
        invocation: {
          operationId: 'op_turn_private',
          generation: 7,
          invocationId: 'op_turn_private:g7:model:0',
          parentInvocationId: 'op_turn_private:g7:run',
          traceId: 'trace_private',
        },
        telemetry: {
          phase: 'model',
          durationMs: 12,
        },
      },
      provider: {
        provider: 'openai',
        apiKey: 'SECRET_API_KEY',
        baseUrl: 'https://provider.example.com',
        rawPayload: { token: 'SECRET_TOKEN' },
      },
      runtime: {
        stdout: 'STDOUT_SECRET',
        stderr: 'STDERR_SECRET',
        privatePath: '/Users/example/private/report.md',
      },
      trace: {
        diagnostics: {
          stack: 'STACK_SECRET',
        },
      },
    });

    const serialized = JSON.stringify(event);

    expect(event.type).toBe('tool.end');
    expect(event.chatId).toBe('123');
    expect(serialized).toContain('report.md');
    expect(serialized).not.toContain('SECRET_API_KEY');
    expect(serialized).not.toContain('SECRET_TOKEN');
    expect(serialized).not.toContain('STDOUT_SECRET');
    expect(serialized).not.toContain('STDERR_SECRET');
    expect(serialized).not.toContain('STACK_SECRET');
    expect(serialized).not.toContain('LOG_SECRET');
    expect(serialized).not.toContain('runtimeLog');
    expect(serialized).not.toContain('SECRET_CONTEXT_KEY');
    expect(serialized).not.toContain('contextManifest');
    expect(serialized).not.toContain('op_turn_private');
    expect(serialized).not.toContain('trace_private');
    expect(serialized).not.toContain('telemetry');
    expect(serialized).not.toContain('/Users/example/private');
    expect(JSON.parse(serialized)).toMatchObject({
      type: 'tool.end',
      chatId: '123',
      taskId: 'task_1',
      conversationGid: 'g_0123456789abcdefghijklmn',
    });
  });

  it('strips owner private file preview and download URLs from public events', () => {
    const fileId = 'file_privateeventaaaaaaaaaaaa';
    const event = projectInternalAgentEventToPublic({
      type: 'tool.end',
      chatId: 'c_private_event',
      taskId: 'task_private_event',
      conversationGid: 'g_0123456789abcdefghijklmn',
      toolCallId: 'tool_private_file',
      timestamp: 1710000000002,
      data: {
        display: {
          fileId,
          displayName: 'report.pdf',
          name: 'report.pdf',
          mime: 'application/pdf',
          size: 2048,
          role: 'final',
          visibility: 'private',
          previewUrl: `/api/files/${fileId}/preview`,
          downloadUrl: `https://files.example.test/api/files/${fileId}/download?token=SECRET`,
          nested: {
            href: `/api/files/${fileId}/preview`,
            note: `open /api/files/${fileId}/download?token=SECRET`,
          },
        },
        assets: [
          {
            fileId,
            displayName: 'report.pdf',
            url: `/api/files/${fileId}/download`,
          },
        ],
      },
    });

    const serialized = JSON.stringify(event);

    expect(serialized).toContain(fileId);
    expect(serialized).toContain('report.pdf');
    expect(serialized).toContain('application/pdf');
    expect(serialized).toContain('privateDownloadHidden');
    expect(serialized).toContain('privatePreviewHidden');
    expect(serialized).not.toContain('/api/files/');
    expect(serialized).not.toContain('SECRET');
    expect((event.data as any).display.downloadUrl).toBeUndefined();
    expect((event.data as any).display.previewUrl).toBeUndefined();
    expect((event.data as any).display.nested.href).toBeUndefined();
    expect((event.data as any).assets[0].url).toBeUndefined();
  });

  it('backfills fileId when hiding private file urls so streamed media stays addressable', () => {
    const fileId = 'file_streammediaaaaaaaaaaaaa';
    const event = projectInternalAgentEventToPublic({
      type: 'tool.end',
      chatId: 'c_stream_media',
      toolCallId: 'tool_stream_media',
      timestamp: 1710000000003,
      data: {
        output: {
          files: [
            {
              // 文件项只有私有 URL、没有显式 fileId（媒体生成工具的常见形态）
              name: 'generated.png',
              mime: 'image/png',
              previewUrl: `/api/files/${fileId}/preview`,
              downloadUrl: `/api/files/${fileId}/download`,
            },
          ],
        },
      },
    });

    const projectedFile = (event.data as any).output.files[0];
    expect(projectedFile.previewUrl).toBeUndefined();
    expect(projectedFile.downloadUrl).toBeUndefined();
    expect(projectedFile.fileId).toBe(fileId);
    expect(projectedFile.privatePreviewHidden).toBe(true);
    expect(projectedFile.privateDownloadHidden).toBe(true);
    expect(JSON.stringify(event)).not.toContain('/api/files/');
  });

  it('keeps explicit fileId untouched while hiding private urls', () => {
    const fileId = 'file_explicitidaaaaaaaaaaaa';
    const event = projectInternalAgentEventToPublic({
      type: 'tool.end',
      chatId: 'c_explicit_id',
      toolCallId: 'tool_explicit_id',
      timestamp: 1710000000004,
      data: {
        output: {
          files: [
            {
              fileId,
              name: 'generated.mp4',
              mime: 'video/mp4',
              downloadUrl: `/api/files/${fileId}/download`,
            },
          ],
        },
      },
    });

    const projectedFile = (event.data as any).output.files[0];
    expect(projectedFile.fileId).toBe(fileId);
    expect(projectedFile.downloadUrl).toBeUndefined();
  });

  it('sanitizes object and string frontend messages before restoring public event fields', () => {
    const fileId = 'file_snapshotmessageaaaaaaaa';
    const privateFields = {
      operationId: 'op_should_be_blocked',
      generation: 9,
      invocationId: 'op_should_be_blocked:g9:model:0',
      telemetry: { phase: 'model', raw: 'PRIVATE_RAW' },
      privatePath: '/Users/private/snapshot.txt',
    };
    const message = {
      role: 'assistant',
      content: 'legitimate answer',
      ...privateFields,
      rounds: [
        {
          id: 'round_1',
          ...privateFields,
          toolCalls: [] as ToolCall[],
        },
      ],
      turn: { id: 'turn_public_1', status: 'running', ...privateFields },
      attachment: {
        fileId,
        displayName: 'report.pdf',
        downloadUrl: `/api/files/${fileId}/download?token=PRIVATE_TOKEN`,
      },
      note: 'apiKey=PRIVATE_KEY',
    };

    for (const candidate of [message, JSON.stringify(message)]) {
      const event = projectInternalAgentEventToPublic({
        type: 'snapshot.sync',
        chatId: 'c_snapshot_message',
        messageId: 'c_snapshot_message',
        timestamp: 1710000000005,
        data: {
          reason: 'resync',
          content: 'legitimate answer',
          message: candidate,
          initialMessages: {
            user: { message: candidate },
            assistant: { message: candidate },
          },
        },
      });

      const serialized = JSON.stringify(event);
      const projectedMessage = JSON.parse(String((event.data as any).message));
      const projectedInitialUser = JSON.parse(
        String((event.data as any).initialMessages.user.message),
      );
      const projectedInitialAssistant = JSON.parse(
        String((event.data as any).initialMessages.assistant.message),
      );

      expect(projectedMessage.content).toBe('legitimate answer');
      expect(projectedMessage.turn).toMatchObject({ id: 'turn_public_1', status: 'running' });
      expect(projectedMessage.attachment.fileId).toBe(fileId);
      expect(projectedMessage.attachment.downloadUrl).toBeUndefined();
      expect(projectedMessage.note).toBe('[已脱敏]');
      expect(projectedInitialUser.content).toBe('legitimate answer');
      expect(projectedInitialAssistant.content).toBe('legitimate answer');
      expect(serialized).not.toContain('op_should_be_blocked');
      expect(serialized).not.toContain('generation');
      expect(serialized).not.toContain('invocationId');
      expect(serialized).not.toContain('telemetry');
      expect(serialized).not.toContain('PRIVATE_RAW');
      expect(serialized).not.toContain('PRIVATE_KEY');
      expect(serialized).not.toContain('PRIVATE_TOKEN');
      expect(serialized).not.toContain('/Users/private');
      expect(serialized).not.toContain('/api/files/');
    }
  });

  it('keeps canonical snapshot tool outputs stable across repeated public projection', () => {
    const fileId = 'file_canonicalsnapshotaaaaaa';
    const canonicalMessage = {
      role: 'assistant',
      content: 'done',
      rounds: [
        {
          text: 'done',
          thinking: null as string | null,
          completed: true,
          toolCalls: [
            {
              id: 'call_primitive',
              name: 'read',
              toolName: 'read',
              status: 'success',
              arguments: {},
              output: 'plain output',
            },
            {
              id: 'call_private_file',
              name: 'file',
              status: 'success',
              arguments: {},
              output: {
                fileId,
                downloadUrl: `/api/files/${fileId}/download?token=PRIVATE_TOKEN`,
                rawPayload: 'PRIVATE_RAW',
              },
            },
          ],
        },
      ],
    };
    const source = {
      type: 'snapshot.sync',
      chatId: 'c_canonical_snapshot',
      timestamp: 1710000000006,
      data: {
        reason: 'resync',
        content: 'done',
        message: JSON.stringify(canonicalMessage),
      },
    } as any;

    const once = sanitizeAgentEventForFrontend(source);
    const twice = sanitizeAgentEventForFrontend(once);
    const projectedMessage = JSON.parse(String((twice.data as any).message));

    expect(twice).toEqual(once);
    expect(projectedMessage.rounds[0].toolCalls[0].output).toBe('plain output');
    expect(projectedMessage.rounds[0].toolCalls[0]).not.toHaveProperty('display');
    expect(projectedMessage.rounds[0].toolCalls[0]).not.toHaveProperty('type');
    expect(projectedMessage.rounds[0].toolCalls[1].output.fileId).toBe(fileId);
    expect(JSON.stringify(twice)).not.toContain('/api/files/');
    expect(JSON.stringify(twice)).not.toContain('PRIVATE_TOKEN');
    expect(JSON.stringify(twice)).not.toContain('PRIVATE_RAW');
  });

  it('keeps presentation and question results through the owner snapshot and a non-canonical public projection', async () => {
    const provider = new ConversationToolProvider();
    const store = new FileRefMappingStore();
    store.registerFile('file_aaaaaaaaaaaaaaaaaaaaaaaa', {
      refKind: 'output_file',
      name: 'deck.pptx',
    });
    const context = (toolCallId: string) =>
      ({
        input: { messages: [], config: {}, context: {} },
        toolCallId,
        fileRefMappingStore: store,
      }) as any;
    const presentation = await provider.execute(
      'present_files',
      { files: [{ file: 'deck.pptx', caption: '终稿' }] },
      context('call_present'),
    );
    const question = await provider.execute(
      'ask_user',
      { question: '要哪种配色？', options: ['深色', '浅色'] },
      context('call_ask'),
    );
    // 落库形态：后端工具调用；轮次带 thinkingDuration / phase、消息带 tokens，不是 canonical 快照
    const backendMessage = {
      role: 'assistant',
      content: '初稿完成。\n\n要哪种配色？\n1. 深色\n2. 浅色',
      tokens: { input: 10, output: 5, total: 15 },
      rounds: [
        {
          text: '先做初稿。',
          thinking: 'plan',
          thinkingDuration: 1200,
          phase: 'process',
          completed: true,
          toolCalls: [],
        },
        {
          text: '初稿完成。',
          thinking: null,
          completed: true,
          toolCalls: [toBackendToolCall(presentation), toBackendToolCall(question)],
        },
      ],
    };
    const ownerSnapshot = stringifyFrontendMessage(backendMessage, OWNER_FRONTEND_MESSAGE_OPTIONS);
    const projected = sanitizeAgentEventForFrontend({
      type: 'snapshot.sync',
      chatId: 'cid_1',
      timestamp: 1,
      data: {
        reason: 'workflow_complete',
        message: ownerSnapshot,
        content: backendMessage.content,
      },
    } as any);
    const message = JSON.parse((projected.data as any).message);

    expect(message.rounds[0].phase).toBe('process');
    expect(findPresentedFiles(message)).toEqual([
      { fileId: 'file_aaaaaaaaaaaaaaaaaaaaaaaa', caption: '终稿' },
    ]);
    expect(findQuestion(message)).toEqual({ text: '要哪种配色？', options: ['深色', '浅色'] });
    const presentedCall = message.rounds[1].toolCalls[0];
    expect(presentedCall.type).toBe('presentation');
    expect(presentedCall.assets.map((asset: any) => asset.fileId)).toEqual([
      'file_aaaaaaaaaaaaaaaaaaaaaaaa',
    ]);
    // 二次投影与属主快照一致
    expect(presentedCall.display).toEqual(JSON.parse(ownerSnapshot).rounds[1].toolCalls[0].display);
  });
});
