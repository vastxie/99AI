import {
  type AgentToolCallTrace,
  buildDisplayPayload,
  buildModelPayload,
  createLayeredToolResult,
  enrichOutputHintWithInput,
  getToolModelContent,
  sanitizeFrontendMessage,
  sanitizeToolInput,
  stringifyFrontendMessage,
  toBackendToolCall,
  toFrontendToolCall,
} from './tool-result-payload';
import { createUnsafeToolCall } from '../../test/factories/tool-call.factory';
import { FileRefMappingStore } from '../fileAsset/file-refs';
import type { AgentRoundTrace } from './types/message.types';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('tool-result-payload frontend projection', () => {
  it('redacts sensitive URL query values from input summaries', () => {
    const summary = sanitizeToolInput({
      url: 'https://files.example.com/report.pdf?token=SECRET_TOKEN&X-Amz-Signature=SECRET_SIGNATURE&safe=1',
    });

    expect(summary).toContain('url:');
    expect(summary).not.toContain('SECRET_TOKEN');
    expect(summary).not.toContain('SECRET_SIGNATURE');
    expect(summary).toContain('safe=1');
  });

  it('removes normalized raw/debug output keys from display fallback content', () => {
    const display = buildDisplayPayload({
      raw_output: 'RAW_SECRET',
      provider_response: { text: 'PROVIDER_SECRET' },
      'provider.response': { text: 'PROVIDER_DOT_SECRET' },
      STDERR: 'STDERR_SECRET',
      file_tree: 'TREE_SECRET',
      safe: 'visible',
    });
    const serialized = JSON.stringify(display);

    expect(serialized).toContain('visible');
    expect(serialized).not.toContain('RAW_SECRET');
    expect(serialized).not.toContain('PROVIDER_SECRET');
    expect(serialized).not.toContain('PROVIDER_DOT_SECRET');
    expect(serialized).not.toContain('STDERR_SECRET');
    expect(serialized).not.toContain('TREE_SECRET');
  });

  it('rebuilds untrusted display payloads before sending them to frontend', () => {
    const toolCall = toFrontendToolCall({
      id: 'tool_1',
      name: '工具',
      status: 'error',
      inputSummary: 'url=https://api.example.com?api_key=SECRET_API_KEY',
      display: {
        publicError: 'Authorization: Bearer SECRET_BEARER',
        stdout: 'STDOUT_SECRET',
        raw_output: 'RAW_SECRET',
      },
    });
    const serialized = JSON.stringify(toolCall);

    expect(toolCall.arguments).toEqual({});
    expect(serialized).not.toContain('SECRET_API_KEY');
    expect(serialized).not.toContain('SECRET_BEARER');
    expect(serialized).not.toContain('STDOUT_SECRET');
    expect(serialized).not.toContain('RAW_SECRET');
  });

  it('sanitizes legacy snapshot messages before frontend resync', () => {
    const sanitized = sanitizeFrontendMessage({
      role: 'assistant',
      rounds: [
        {
          toolCalls: [
            {
              id: 'tool_1',
              name: '工具',
              arguments: {
                url: 'https://api.example.com?token=SECRET_TOKEN',
              },
              output: {
                content: 'ok',
                stack: 'STACK_SECRET',
                stdout: 'STDOUT_SECRET',
                provider_response: 'PROVIDER_SECRET',
                details: [
                  {
                    title: '结果',
                    url: 'https://api.example.com/item?api_key=SECRET_API_KEY',
                    content: 'Bearer SECRET_BEARER',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const toolCall = sanitized.rounds[0].toolCalls[0];
    const serialized = JSON.stringify(sanitized);

    expect(toolCall.arguments).toEqual({});
    expect(serialized).not.toContain('SECRET_TOKEN');
    expect(serialized).not.toContain('SECRET_API_KEY');
    expect(serialized).not.toContain('SECRET_BEARER');
    expect(serialized).not.toContain('STACK_SECRET');
    expect(serialized).not.toContain('STDOUT_SECRET');
    expect(serialized).not.toContain('PROVIDER_SECRET');
  });

  it('strips run, round, and tool internals from frontend messages without mutating backend data', () => {
    const backendMessage = {
      role: 'assistant',
      content: 'visible',
      trace: { traceId: 'trace_secret', status: 'success', rounds: [] as AgentRoundTrace[] },
      rounds: [
        {
          trace: { roundIndex: 0, toolCalls: [] as AgentToolCallTrace[] },
          toolCalls: [
            {
              id: 'tool_1',
              name: '工具',
              status: 'success',
              internal: {
                fileRefs: {
                  entries: [{ fileRef: 'output_file_1', fileId: 'file_secretsecretsecret' }],
                },
                trace: {
                  callId: 'tool_1',
                  toolName: '工具',
                  status: 'success',
                },
                diagnostics: { provider: 'runtime' },
              },
              output: { summary: 'visible' },
            },
          ],
        },
      ],
    };

    const sanitized = sanitizeFrontendMessage(backendMessage);
    const serialized = JSON.stringify(sanitized);

    expect(serialized).toContain('visible');
    expect(serialized).not.toContain('"trace"');
    expect(serialized).not.toContain('"internal"');
    expect(serialized).not.toContain('"diagnostics"');
    expect(serialized).not.toContain('file_secretsecretsecret');
    expect(backendMessage.trace.traceId).toBe('trace_secret');
    expect((backendMessage.rounds[0].toolCalls[0] as any).internal.fileRefs.entries[0].fileId).toBe(
      'file_secretsecretsecret',
    );
  });

  it('sanitizes multi-round frontend messages without leaking raw tool data', () => {
    const sanitized = sanitizeFrontendMessage({
      role: 'assistant',
      rounds: [
        { toolCalls: [createUnsafeToolCall({ id: 'tool_1' })] },
        {
          toolCalls: [
            createUnsafeToolCall({
              id: 'tool_2',
              arguments: {
                query: 'public query',
                cookie: 'SECRET_COOKIE',
              },
              output: {
                content: 'visible result',
                stack: 'STACK_SECRET',
                request: { authorization: 'Bearer SECRET_AUTH' },
              },
            }),
          ],
        },
      ],
    });
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.rounds[0].toolCalls[0].arguments).toEqual({});
    expect(sanitized.rounds[1].toolCalls[0].arguments).toEqual({});
    expect(serialized).toContain('visible result');
    expect(serialized).not.toContain('SECRET_TOKEN');
    expect(serialized).not.toContain('SECRET_COOKIE');
    expect(serialized).not.toContain('STACK_SECRET');
    expect(serialized).not.toContain('SECRET_AUTH');
  });

  it('stringifies string, object, and invalid JSON messages with stable sanitizing behavior', () => {
    const objectMessage = JSON.parse(
      stringifyFrontendMessage({
        role: 'assistant',
        rounds: [{ toolCalls: [createUnsafeToolCall()] }],
      }),
    );
    const jsonMessage = JSON.parse(
      stringifyFrontendMessage(
        JSON.stringify({
          role: 'assistant',
          rounds: [{ toolCalls: [createUnsafeToolCall()] }],
        }),
      ),
    );

    expect(objectMessage.rounds[0].toolCalls[0].arguments).toEqual({});
    expect(jsonMessage.rounds[0].toolCalls[0].arguments).toEqual({});
    expect(stringifyFrontendMessage('plain text')).toBe('"plain text"');
    expect(stringifyFrontendMessage('{"role":"assistant",')).toBe('"{\\"role\\":\\"assistant\\","');
  });

  it('ignores old artifact/media payload keys after FileAsset hard cut', () => {
    const display = buildDisplayPayload({
      content: 'file ready',
      artifacts: [
        {
          type: 'file',
          title: 'secret',
          url: 'https://cdn.example.com/secret.pdf?token=SECRET_ARTIFACT_TOKEN',
        },
      ],
      fileUrl: JSON.stringify([{ name: 'local.pdf', url: '/file/reports/local.pdf' }]),
    });
    const serialized = JSON.stringify(display);

    expect(display.files).toBeUndefined();
    expect(serialized).not.toContain('/file/reports/local.pdf');
    expect(serialized).not.toContain('SECRET_ARTIFACT_TOKEN');
  });

  it('does not expose external FileAsset URLs with sensitive query values', () => {
    const display = buildDisplayPayload({
      files: [
        {
          type: 'image',
          name: 'secret.png',
          url: 'https://cdn.example.com/secret.png?token=SECRET_IMAGE_TOKEN',
        },
      ],
      attachments: [
        {
          type: 'file',
          name: 'secret.pdf',
          url: 'https://cdn.example.com/secret.pdf?X-Amz-Signature=SECRET_FILE_SIGNATURE',
        },
      ],
      filePreview: [
        {
          title: '报告',
          fileType: 'markdown',
          previewContent: '# report',
          previewContentType: 'markdown',
          downloadUrl: 'https://cdn.example.com/report.md?api_key=SECRET_DOWNLOAD_KEY',
        },
      ],
      downloadUrl: 'https://cdn.example.com/report.md?credential=SECRET_CREDENTIAL',
    });
    const serialized = JSON.stringify(display);

    expect(serialized).not.toContain('SECRET_IMAGE_TOKEN');
    expect(serialized).not.toContain('SECRET_FILE_SIGNATURE');
    expect(serialized).not.toContain('SECRET_DOWNLOAD_KEY');
    expect(serialized).not.toContain('SECRET_CREDENTIAL');
    expect(JSON.stringify(display.files || [])).not.toContain('SECRET_IMAGE_TOKEN');
    expect(JSON.stringify(display.files || [])).not.toContain('SECRET_FILE_SIGNATURE');
    expect(display.downloadUrl).toBeUndefined();
    expect(display.filePreview.downloadUrl).toBeUndefined();
  });

  it('keeps safe downloadUrl with filePreview and mirrors it into document files', () => {
    const display = buildDisplayPayload({
      title: 'Notes',
      fileType: 'markdown',
      previewContent: '# Notes',
      previewContentType: 'markdown',
      downloadUrl: '/file/reports/notes.md',
    });

    expect(display.downloadUrl).toBe('/file/reports/notes.md');
    expect(display.filePreview).toMatchObject({
      title: 'Notes',
      fileType: 'markdown',
      previewContent: '# Notes',
      previewContentType: 'markdown',
      downloadUrl: '/file/reports/notes.md',
    });
    expect(display.files).toEqual([
      {
        type: 'document',
        title: 'Notes',
        role: 'preview',
        fileType: 'markdown',
        downloadUrl: '/file/reports/notes.md',
        preview: {
          contentType: 'markdown',
          content: '# Notes',
        },
      },
    ]);
  });

  it('sanitizes image, video, audio, and file collections consistently', () => {
    const display = buildDisplayPayload({
      files: [
        {
          type: 'image',
          name: 'image.png',
          role: 'final',
          url: 'https://cdn.example.com/image.png?token=SECRET_IMAGE_TOKEN',
        },
        {
          type: 'video',
          name: 'safe-video.mp4',
          role: 'final',
          url: '/file/videos/safe-video.mp4',
        },
        {
          type: 'video',
          name: 'secret-video.mp4',
          role: 'final',
          url: 'https://cdn.example.com/video.mp4?signature=SECRET_VIDEO_SIGNATURE',
        },
        {
          type: 'audio',
          name: 'audio.mp3',
          role: 'final',
          url: 'https://cdn.example.com/audio.mp3',
        },
        {
          type: 'file',
          name: 'report.pdf',
          url: 'https://cdn.example.com/report.pdf?credential=SECRET_FILE_CREDENTIAL',
        },
      ],
    });
    const serialized = JSON.stringify(display);

    expect(display.files).toEqual([
      {
        type: 'video',
        title: 'safe-video.mp4',
        url: '/file/videos/safe-video.mp4',
        downloadUrl: '/file/videos/safe-video.mp4',
        role: 'final',
      },
      {
        type: 'audio',
        title: 'audio.mp3',
        url: 'https://cdn.example.com/audio.mp3',
        downloadUrl: 'https://cdn.example.com/audio.mp3',
        role: 'final',
      },
    ]);
    expect(serialized).not.toContain('SECRET_IMAGE_TOKEN');
    expect(serialized).not.toContain('SECRET_VIDEO_SIGNATURE');
    expect(serialized).not.toContain('SECRET_FILE_CREDENTIAL');
  });

  it('keeps virtual document preview fields stable while dropping unsafe preview downloads', () => {
    const display = buildDisplayPayload({
      filePreview: [
        {
          title: 'Internal Notes',
          fileType: 'markdown',
          previewContent: '# Internal',
          previewContentType: 'markdown',
          downloadUrl: '/file/docs/internal.md',
        },
        {
          title: 'Authorization: Bearer SECRET_BEARER',
          fileType: 'text',
          previewContent: 'external',
          previewContentType: 'text',
          downloadUrl: 'https://cdn.example.com/external.txt?api_key=SECRET_PREVIEW_KEY',
        },
      ],
    });
    const serialized = JSON.stringify(display);

    expect(display.filePreview).toEqual([
      {
        title: 'Internal Notes',
        fileType: 'markdown',
        previewContent: '# Internal',
        previewContentType: 'markdown',
        downloadUrl: '/file/docs/internal.md',
      },
      {
        title: 'Authorization=[已隐藏] [已隐藏]',
        fileType: 'text',
        previewContent: 'external',
        previewContentType: 'text',
      },
    ]);
    expect(display.files).toEqual([
      {
        type: 'document',
        title: 'Internal Notes',
        role: 'preview',
        fileType: 'markdown',
        downloadUrl: '/file/docs/internal.md',
        preview: {
          contentType: 'markdown',
          content: '# Internal',
        },
      },
      {
        type: 'document',
        title: 'Authorization=[已隐藏] [已隐藏]',
        role: 'preview',
        fileType: 'text',
        downloadUrl: undefined,
        preview: {
          contentType: 'text',
          content: 'external',
        },
      },
    ]);
    expect(serialized).not.toContain('SECRET_BEARER');
    expect(serialized).not.toContain('SECRET_PREVIEW_KEY');
  });

  it('keeps public file URLs without sensitive query values', () => {
    const display = buildDisplayPayload({
      files: [
        {
          type: 'image',
          name: 'public.png',
          role: 'final',
          url: 'https://cdn.example.com/public.png',
        },
        {
          type: 'file',
          name: 'legacy.txt',
          url: 'https://cdn.example.com/legacy.txt',
        },
      ],
      attachments: [
        {
          type: 'file',
          name: 'local.pdf',
          role: 'final',
          url: '/file/reports/local.pdf',
        },
      ],
    });

    expect(display.files).toEqual([
      {
        type: 'image',
        title: 'public.png',
        url: 'https://cdn.example.com/public.png',
        downloadUrl: 'https://cdn.example.com/public.png',
        role: 'final',
      },
      {
        type: 'file',
        title: 'local.pdf',
        url: '/file/reports/local.pdf',
        downloadUrl: '/file/reports/local.pdf',
        role: 'final',
      },
    ]);
    expect(display).not.toHaveProperty('fileAssets');
    expect(display).not.toHaveProperty('attachments');
  });

  it('normalizes absolute private FileAsset download URLs to internal paths', () => {
    const display = buildDisplayPayload({
      files: [
        {
          type: 'file',
          name: 'report.pdf',
          url: 'https://evil.example.com/api/files/file_report/download',
          fileId: 'file_report',
          role: 'final',
          visibility: 'private',
        },
      ],
      fileAssets: [
        {
          id: 'file_sheet',
          name: 'sheet.xlsx',
          role: 'final',
          downloadUrl: 'https://evil.example.com/api/files/file_sheet/download',
          visibility: 'private',
        },
      ],
    });
    const serialized = JSON.stringify(display);

    expect(display.files).toEqual([
      {
        type: 'file',
        id: 'file_sheet',
        fileId: 'file_sheet',
        title: 'sheet.xlsx',
        downloadUrl: '/api/files/file_sheet/download',
        role: 'final',
        visibility: 'private',
      },
      {
        type: 'file',
        id: 'file_report',
        fileId: 'file_report',
        title: 'report.pdf',
        url: '/api/files/file_report/download',
        downloadUrl: '/api/files/file_report/download',
        role: 'final',
        visibility: 'private',
      },
    ]);
    expect(serialized).not.toContain('evil.example.com');
  });

  it('derives explicit fileId from internal urls for url-only file items', () => {
    const display = buildDisplayPayload({
      files: [
        {
          type: 'image',
          name: 'generated.png',
          role: 'final',
          // 媒体生成工具常只回传站内 URL，不带显式 fileId
          previewUrl: '/api/files/file_urlonlyimage/preview',
          downloadUrl: '/api/files/file_urlonlyimage/download',
          visibility: 'private',
        },
        {
          type: 'video',
          name: 'generated.mp4',
          role: 'final',
          url: 'https://files.example.test/api/files/file_urlonlyvideo/download',
          visibility: 'private',
        },
      ],
    });

    expect(display.files?.[0]).toMatchObject({
      id: 'file_urlonlyimage',
      fileId: 'file_urlonlyimage',
    });
    expect(display.files?.[1]).toMatchObject({
      id: 'file_urlonlyvideo',
      fileId: 'file_urlonlyvideo',
    });
  });

  it('hides intermediate image preprocessing roles while keeping preview visible', () => {
    const display = buildDisplayPayload({
      content: '图片预处理完成',
      stdout: 'STDOUT_SECRET',
      stderr: 'STDERR_SECRET',
      stack: 'STACK_SECRET',
      files: [
        {
          type: 'image',
          name: 'foreground.png',
          url: '/api/files/file_foreground/download',
          fileId: 'file_foreground',
          role: 'intermediate',
        },
        {
          type: 'image',
          name: 'preview.png',
          url: '/api/files/file_preview/download',
          fileId: 'file_preview',
          role: 'preview',
        },
      ],
      attachments: [
        {
          type: 'file',
          name: 'mask.png',
          url: '/api/files/file_mask/download',
          fileId: 'file_mask',
          role: 'intermediate',
        },
      ],
    });
    const serialized = JSON.stringify(display);

    expect(display.files).toEqual([
      {
        type: 'image',
        id: 'file_preview',
        fileId: 'file_preview',
        title: 'preview.png',
        url: '/api/files/file_preview/download',
        downloadUrl: '/api/files/file_preview/download',
        role: 'preview',
      },
    ]);
    expect(serialized).not.toContain('STDOUT_SECRET');
    expect(serialized).not.toContain('STDERR_SECRET');
    expect(serialized).not.toContain('STACK_SECRET');
    expect(serialized).not.toContain('foreground.png');
    expect(serialized).not.toContain('mask.png');
  });

  it('applies delivery roles so final files show and source files stay model-only', () => {
    const layered = createLayeredToolResult({
      id: 'tool_delivery_roles',
      type: 'tool',
      name: 'PDF 工具',
      status: 'success',
      output: { kind: 'runtime' },
      rawOutput: {
        content: 'PDF created.',
        files: [
          {
            type: 'document',
            fileId: 'file_finalpdf00000000000001',
            name: 'report.pdf',
            mime: 'application/pdf',
            role: 'final',
          },
          {
            type: 'file',
            fileId: 'file_sourcetex00000000000001',
            name: 'report.tex',
            mime: 'text/x-tex',
            role: 'source',
          },
        ],
      },
    });

    const backendToolCall = toBackendToolCall(layered);
    const frontendToolCall = toFrontendToolCall(backendToolCall);
    const feedback = getToolModelContent(backendToolCall);

    expect(feedback).toContain('fileRef=output_file_1');
    expect(feedback).toContain('fileRef=output_file_2');
    expect(frontendToolCall.output.files).toHaveLength(1);
    expect(frontendToolCall.output.files[0]).toMatchObject({
      title: 'report.pdf',
      role: 'final',
    });
    expect(JSON.stringify(frontendToolCall)).not.toContain('report.tex');
  });

  it('keeps safe output hints on frontend tool calls', () => {
    const toolCall = toFrontendToolCall({
      id: 'tool_1',
      name: 'GPT Image 2 绘图',
      status: 'loading',
      outputHint: { type: 'image', aspectRatio: '1:1' },
    });

    expect(toolCall.outputHint).toEqual({ type: 'image', aspectRatio: '1:1' });
    expect(toolCall.display.outputHint).toEqual({ type: 'image', aspectRatio: '1:1' });
  });

  it('keeps model file summaries without private FileAsset ids, download URLs or paths', () => {
    const fileId = 'file_aaaaaaaaaaaaaaaaaaaaaaaa';
    const model = buildModelPayload({
      content: '文件已生成',
      fileAssets: [
        {
          fileId,
          name: 'report.csv',
          mime: 'text/csv',
          size: 1024,
          visibility: 'private',
          downloadUrl: `/api/files/${fileId}/download`,
          storagePath: '/private/storage/report.csv',
        },
      ],
    });
    const serialized = JSON.stringify(model);

    expect(model.content).toContain('name=report.csv');
    expect(model.content).toContain('fileRef=output_file_1');
    expect(model.files?.[0]).toMatchObject({
      fileRef: 'output_file_1',
      name: 'report.csv',
      mime: 'text/csv',
      size: 1024,
    });
    expect(model).not.toHaveProperty('fileAssets');
    expect(model).not.toHaveProperty('attachments');
    expect(serialized).not.toContain(fileId);
    expect(serialized).not.toContain(`/api/files/${fileId}/download`);
    expect(serialized).not.toContain('/private/storage/report.csv');
    expect(serialized).not.toContain('storagePath');
  });

  it('allocates unique output refs across sequential tools in one shared turn', () => {
    const store = new FileRefMappingStore({
      entries: [
        {
          fileRef: 'output_file_1',
          fileId: 'file_historical000000000000001',
          origin: 'history',
        },
      ],
    });
    const first = createLayeredToolResult({
      id: 'tool_turn_file_1',
      type: 'tool',
      name: '表格处理',
      status: 'success',
      fileRefMappingStore: store,
      rawOutput: {
        files: [
          {
            fileId: 'file_currentxlsx00000000000001',
            name: 'current.xlsx',
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ],
      },
    });
    const second = createLayeredToolResult({
      id: 'tool_turn_file_2',
      type: 'tool',
      name: 'PDF 处理',
      status: 'success',
      fileRefMappingStore: store,
      rawOutput: {
        files: [
          {
            fileId: 'file_currentpdf000000000000001',
            name: 'current.pdf',
            mime: 'application/pdf',
          },
        ],
      },
    });

    expect(first.model.files?.[0].fileRef).toBe('output_file_2');
    expect(first.internal.fileRefs?.entries).toEqual([
      expect.objectContaining({
        fileRef: 'output_file_2',
        fileId: 'file_currentxlsx00000000000001',
      }),
    ]);
    expect(second.model.files?.[0].fileRef).toBe('output_file_3');
    expect(second.internal.fileRefs?.entries).toEqual([
      expect.objectContaining({
        fileRef: 'output_file_3',
        fileId: 'file_currentpdf000000000000001',
      }),
    ]);
    expect(store.snapshot().counters.output_file).toBe(3);
  });

  it('hides bare FileAsset ids from user-visible display summaries', () => {
    const display = buildDisplayPayload({
      summary:
        '文件已生成，内部编号 file_display_secret，可下载 /api/files/file_display_secret/download',
    });
    const serialized = JSON.stringify(display);

    expect(serialized).not.toContain('file_display_secret');
    expect(serialized).not.toContain('/api/files/file_display_secret/download');
    expect(display.summary).toContain('[private-file]');
  });

  it('strips private FileAsset download URLs from model content strings', () => {
    const fileId = 'file_bbbbbbbbbbbbbbbbbbbbbbbb';
    const model = buildModelPayload({
      content: `下载地址 /api/files/${fileId}/download、预览地址 /api/files/${fileId}/preview 与 https://example.com/api/files/file_other/download`,
      fileAssets: [
        {
          fileId,
          name: 'secret.csv',
          mime: 'text/csv',
          visibility: 'private',
        },
      ],
    });

    expect(JSON.stringify(model)).not.toContain(fileId);
    expect(model.content).not.toContain(`/api/files/${fileId}/download`);
    expect(model.content).not.toContain(`/api/files/${fileId}/preview`);
    expect(model.content).not.toContain('example.com/api/files/file_other/download');
  });

  it('compacts search results to the first five title/link/snippet entries', () => {
    const model = buildModelPayload(
      {
        details: Array.from({ length: 6 }, (_, index) => ({
          title: `结果 ${index + 1}`,
          url: `https://example.com/${index + 1}`,
          snippet: `摘要 ${index + 1}`,
          domain: 'example.com',
        })),
      },
      { toolName: 'web_search' },
    );

    expect(model.content).toContain('搜索结果摘要');
    expect(model.content).toContain('结果 1');
    expect(model.content).toContain('链接=https://example.com/1');
    expect(model.content).toContain('摘要=摘要 5');
    expect(model.content).not.toContain('结果 6');
  });

  it('projects search gateway results into frontend display details', () => {
    const display = buildDisplayPayload({
      summary: '## 搜索结果：GPT-5.6 最新新闻',
      query: 'GPT-5.6 最新新闻',
      results: [
        {
          title: 'OpenAI News',
          url: 'https://openai.com/news/',
          content: 'Official updates from OpenAI.',
          sourceName: 'Tavily',
        },
        {
          title: 'OpenAI Developers',
          link: 'https://developers.openai.com/',
          snippet: 'Developer documentation and release notes.',
          sourceEngine: 'Brave',
          site: 'developers.openai.com',
        },
      ],
    });

    expect(display.details).toEqual([
      expect.objectContaining({
        title: 'OpenAI News',
        url: 'https://openai.com/news/',
        snippet: 'Official updates from OpenAI.',
        domain: 'openai.com',
        sourceName: 'Tavily',
      }),
      expect.objectContaining({
        title: 'OpenAI Developers',
        url: 'https://developers.openai.com/',
        snippet: 'Developer documentation and release notes.',
        domain: 'developers.openai.com',
        sourceName: 'Brave',
      }),
    ]);
  });

  it('keeps search details after layered and repeated frontend projection', () => {
    const layered = createLayeredToolResult({
      id: 'tool_search_projection',
      type: 'tool',
      toolName: 'web_search',
      displayName: '联网搜索',
      name: '联网搜索',
      status: 'success',
      input: { query: '深圳 AI 补贴' },
      output: { kind: 'search' },
      rawOutput: {
        summary: '## 搜索结果：深圳 AI 补贴',
        query: '深圳 AI 补贴',
        results: [
          {
            title: '深圳人工智能产业补贴',
            url: 'https://finance.sina.com.cn/example',
            snippet: '深圳发布人工智能产业扶持政策。',
            sourceName: '百度搜索',
            sourceEngine: 'baidu',
          },
          {
            title: '深圳大力扶持人工智能先锋城市项目',
            url: 'https://www.21jingji.com/example',
            snippet: '政策支持覆盖模型券、训力券和项目申报。',
            sourceName: '百度搜索',
            sourceEngine: 'baidu',
          },
        ],
      },
    });

    const firstFrontend = toFrontendToolCall(layered);
    const secondFrontend = toFrontendToolCall(firstFrontend);

    expect(firstFrontend.output.details).toHaveLength(2);
    expect(firstFrontend.display.json.details).toHaveLength(2);
    expect(secondFrontend.output.details).toHaveLength(2);
    expect(secondFrontend.display.details).toHaveLength(2);
    expect(secondFrontend.output.details[0]).toMatchObject({
      title: '深圳人工智能产业补贴',
      url: 'https://finance.sina.com.cn/example',
      domain: 'finance.sina.com.cn',
      sourceName: '百度搜索',
    });
  });

  it('keeps hosted web search sources after repeated frontend and backend projection', () => {
    const hostedToolCall = {
      id: 'hosted_web_search_test',
      displayName: '联网搜索',
      name: '联网搜索',
      status: 'success',
      type: 'search',
      inputSummary: '搜索：site:openai.com codex OpenAI Codex latest 2026',
      output: {
        summary: '搜索完成，找到 3 个网页来源',
        queries: ['site:openai.com codex OpenAI Codex latest 2026'],
        results: [
          {
            title: 'OpenAI Release Notes',
            url: 'https://openai.com/products/release-notes/',
          },
        ],
        sources: [
          { type: 'url', url: 'https://openai.com/index/codex-for-every-role-tool-workflow/' },
          { type: 'url', url: 'https://help.openai.com/en/articles/6825453-codex-faq' },
        ],
      },
      display: {
        title: '联网搜索',
        summary: '搜索完成，找到 3 个网页来源',
        json: {
          queries: ['site:openai.com codex OpenAI Codex latest 2026'],
          results: [
            {
              title: 'OpenAI Release Notes',
              url: 'https://openai.com/products/release-notes/',
            },
          ],
          sources: [
            { type: 'url', url: 'https://openai.com/index/codex-for-every-role-tool-workflow/' },
            { type: 'url', url: 'https://help.openai.com/en/articles/6825453-codex-faq' },
          ],
        },
      },
    };

    const firstFrontend = toFrontendToolCall(hostedToolCall);
    const secondFrontend = toFrontendToolCall(firstFrontend);
    const backendProjection = toBackendToolCall(secondFrontend);

    expect(firstFrontend.output.queries).toEqual([
      'site:openai.com codex OpenAI Codex latest 2026',
    ]);
    expect(firstFrontend.output.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'OpenAI Release Notes',
          url: 'https://openai.com/products/release-notes/',
          domain: 'openai.com',
        }),
        expect.objectContaining({
          title: 'openai.com',
          url: 'https://openai.com/index/codex-for-every-role-tool-workflow/',
          domain: 'openai.com',
        }),
        expect.objectContaining({
          title: 'help.openai.com',
          url: 'https://help.openai.com/en/articles/6825453-codex-faq',
          domain: 'help.openai.com',
        }),
      ]),
    );
    expect(secondFrontend.output.details).toHaveLength(3);
    expect(backendProjection.output.details).toHaveLength(3);
    expect(backendProjection.output.sources).toHaveLength(2);
    expect(backendProjection.display.details).toHaveLength(3);
  });

  it('does not carry arbitrary display json of other tools through a repeated projection', () => {
    const projectedOnce = {
      id: 'tool_json_projection',
      name: '外部工具',
      status: 'success',
      type: 'tool',
      display: {
        title: '外部工具',
        summary: '完成',
        json: {
          details: [{ title: '结果', url: 'https://example.com/a' }],
          nested: { password: 'P_SECRET', token: 'T_SECRET', secret: 'S_SECRET' },
        },
      },
      output: { summary: '完成' },
    };
    const again = toFrontendToolCall(projectedOnce);
    const serialized = JSON.stringify(again);
    expect(serialized).not.toContain('P_SECRET');
    expect(serialized).not.toContain('T_SECRET');
    expect(serialized).not.toContain('S_SECRET');
    // 伪装成会话控制结果：只保留按类型重建的载荷
    const forged = toFrontendToolCall({
      ...projectedOnce,
      type: 'question',
      display: {
        summary: '问题',
        json: { question: { text: '选哪个？', options: ['A', 'B'], password: 'P_SECRET' } },
      },
    });
    expect(forged.display.json).toEqual({ question: { text: '选哪个？', options: ['A', 'B'] } });
    expect(JSON.stringify(forged)).not.toContain('P_SECRET');
  });

  it('keeps owner audio files after repeated frontend message projection', () => {
    const fileId = 'file_ttsrefreshcasev1';
    const layered = createLayeredToolResult({
      id: 'tool_tts_refresh',
      type: 'tool',
      toolName: 'mimo_tts',
      displayName: '小米 MiMo 语音',
      name: '小米 MiMo 语音',
      status: 'success',
      input: { text: '今晚要不要留下来，好好聊聊？' },
      output: { kind: 'media_generate' },
      outputHint: { type: 'audio' },
      rawOutput: {
        summary: '语音已生成',
        files: [
          {
            type: 'audio',
            fileId,
            title: '擦边口播-诱惑女声.wav',
            previewUrl: `/api/files/${fileId}/preview`,
            downloadUrl: `/api/files/${fileId}/download`,
            mime: 'audio/wav',
            size: 4096,
            visibility: 'private',
            role: 'final',
          },
        ],
      },
    });
    const backendToolCall = toBackendToolCall(layered);
    const firstMessage = stringifyFrontendMessage(
      {
        role: 'assistant',
        content: '语音已经生成好了。',
        rounds: [
          {
            text: '语音已经生成好了。',
            thinking: null,
            toolCalls: [backendToolCall],
          },
        ],
      },
      { exposePrivateFileDownloads: true },
    );
    const secondMessage = stringifyFrontendMessage(firstMessage, {
      exposePrivateFileDownloads: true,
    });

    const first = JSON.parse(firstMessage);
    const second = JSON.parse(secondMessage);
    const firstAudioFile = first.rounds[0].toolCalls[0].output.files[0];
    const secondAudioFile = second.rounds[0].toolCalls[0].output.files[0];

    expect(firstAudioFile).toMatchObject({
      type: 'audio',
      fileId,
      previewUrl: `/api/files/${fileId}/preview`,
      downloadUrl: `/api/files/${fileId}/download`,
      mime: 'audio/wav',
      role: 'final',
    });
    expect(secondAudioFile).toMatchObject({
      type: 'audio',
      fileId,
      previewUrl: `/api/files/${fileId}/preview`,
      downloadUrl: `/api/files/${fileId}/download`,
      mime: 'audio/wav',
      role: 'final',
    });
    expect(JSON.stringify(second)).not.toContain('"internal"');
  });

  it('compacts webpage reading results to title, URL, summary, key paragraphs and link count', () => {
    const model = buildModelPayload(
      {
        title: '网页标题',
        url: 'https://example.com/page',
        content: '第一段正文。\n\n第二段关键内容。\n\n第三段结论。',
        links: ['https://example.com/a', 'https://example.com/b'],
      },
      { toolName: 'browser_reader' },
    );

    expect(model.content).toContain('网页阅读摘要');
    expect(model.content).toContain('标题：网页标题');
    expect(model.content).toContain('URL：https://example.com/page');
    expect(model.content).toContain('链接数量：2');
    expect(model.content).toContain('关键段落');
    expect(model.content).toContain('第二段关键内容');
  });

  it('keeps web-read failures explicit across the provider and executor layering', () => {
    const providerResult = createLayeredToolResult({
      id: 'tool_web_read_error',
      type: 'tool',
      toolName: 'browser_reader',
      displayName: '安全浏览器阅读器 · localhost',
      name: '安全浏览器阅读器 · localhost',
      status: 'error',
      rawOutput: {
        error: 'Agent 应用执行失败。失败提醒: notice-safe-web-read',
        noticeId: 'notice-safe-web-read',
      },
      output: { kind: 'web_read' },
    });
    const executorResult = createLayeredToolResult({
      id: 'tool_web_read_error',
      type: providerResult.type,
      toolName: 'browser_reader',
      displayName: providerResult.displayName,
      name: providerResult.name,
      status: 'error',
      rawOutput: providerResult.output,
      output: providerResult.model.output,
      toolResult: providerResult.toolResult,
    });
    const content = getToolModelContent(executorResult);

    expect(content).toContain('网页阅读结果');
    expect(content).toContain('状态：error');
    expect(content).toContain('Agent 应用执行失败');
    expect(content).toContain('notice-safe-web-read');
    expect(content).not.toContain('标题：未命名网页');
    expect(content).not.toContain('正文摘要：无正文');
  });

  it('compacts Runtime results to summary, output files, error summary and public log summary', () => {
    const fileId = 'file_cccccccccccccccccccccccc';
    const model = buildModelPayload(
      {
        summary: '处理完成，但有一个警告',
        error: '部分页面解析失败',
        publicLogSummary: '公开日志摘要：完成 2 个步骤',
        fileAssets: [
          {
            type: 'document',
            fileId,
            name: 'runtime-output.zip',
            mime: 'application/zip',
            size: 2048,
          },
        ],
        logs: Array.from({ length: 24 }, (_, index) => `log line ${index + 1}`).join('\n'),
        stdout: 'STDOUT_SECRET /tmp/private/output.txt',
        stderr: 'token=SECRET_TOKEN',
      },
      { toolName: 'agent_runtime', status: 'error' },
    );

    expect(model.content).toContain('Runtime 执行摘要');
    expect(model.content).toContain('状态：error');
    expect(model.content).toContain('fileRef=output_file_1');
    expect(model.content).toContain('name=runtime-output.zip');
    expect(JSON.stringify(model)).not.toContain(fileId);
    expect(model.content).toContain('错误摘要：部分页面解析失败');
    expect(model.content).toContain('日志摘要');
    expect(model.content).toContain('公开日志摘要：完成 2 个步骤');
    expect(model.content).not.toContain('log line 1');
    expect(model.content).not.toContain('log line 24');
    expect(model.content).not.toContain('STDOUT_SECRET');
    expect(model.content).not.toContain('SECRET_TOKEN');
    expect(model.content).not.toContain('/tmp/private/output.txt');
  });

  it('does not feed Runtime raw logs to model context without public log summary', () => {
    const model = buildModelPayload(
      {
        summary: 'Runtime 完成',
        logs: 'raw log with /tmp/private/path and token=SECRET_TOKEN',
        stdout: 'stdout raw output',
        stderr: 'stderr raw output',
      },
      { toolName: 'agent_runtime' },
    );

    expect(model.content).toContain('Runtime 执行摘要');
    expect(model.content).not.toContain('raw log');
    expect(model.content).not.toContain('stdout raw output');
    expect(model.content).not.toContain('stderr raw output');
    expect(model.content).not.toContain('SECRET_TOKEN');
  });

  it('keeps Runtime diagnostics internal and stores only sanitized diagnostic summaries', () => {
    const rawRuntimeResult = {
      content: 'Runtime 完成',
      files: [] as unknown[],
      internal: {
        diagnostics: {
          provider: 'agent_runtime',
          runtimeTaskType: 'pdf_tools stdout raw output',
          runtimeOperation: 'merge objectKey=private/runtime/out.pdf',
          outputCount: 0,
          warningCodes: [
            'WARN_STDOUT stdout raw output',
            'SIGNED https://s3.example.com/private/out.pdf?X-Amz-Signature=SECRET_SIGNATURE',
            'API Key: SECRET_API_KEY',
            'api key=SECOND_SECRET_API_KEY',
            'api_key=THIRD_SECRET_API_KEY',
            'access key: ACCESS_SECRET_KEY',
            'secret key=SECRET_KEY_VALUE',
          ],
          sanitizedErrorCode: 'RUNTIME_STACK',
          sanitizedErrorMessage:
            'stack: Error at /tmp/runtime/worker.ts API Key: SECRET_API_KEY api key=SECOND_SECRET_API_KEY api_key=THIRD_SECRET_API_KEY access key: ACCESS_SECRET_KEY secret key=SECRET_KEY_VALUE token=SECRET_TOKEN storagePath=/private/runtime/out.pdf data:image/png;base64,' +
            'A'.repeat(1500),
          runtimeLog:
            'spreadsheet_processor failed stdout raw output stderr raw output Bearer LOG_SECRET /tmp/runtime/job.json https://runtime.local/files/out.xlsx?token=LOG_TOKEN',
        },
      },
    };
    const layered = createLayeredToolResult({
      id: 'runtime_tool_1',
      type: 'tool',
      toolName: 'agent_runtime',
      name: 'Runtime',
      status: 'success',
      rawOutput: rawRuntimeResult,
      output: { kind: 'runtime' },
    });
    const backendToolCall = toBackendToolCall({
      ...layered,
      internal: {
        ...layered.internal,
        ...rawRuntimeResult.internal,
      },
    });
    const frontendToolCall = toFrontendToolCall(backendToolCall);

    expect(backendToolCall.internal.diagnostics).toMatchObject({
      provider: 'agent_runtime',
      outputCount: 0,
      sanitizedErrorCode: 'RUNTIME_[运行诊断已隐藏]',
    });
    expect(backendToolCall.internal.diagnostics).not.toHaveProperty('runtimeLog');
    const serializedDiagnostics = JSON.stringify(backendToolCall.internal.diagnostics);
    expect(serializedDiagnostics).not.toContain('stdout');
    expect(serializedDiagnostics).not.toContain('stderr');
    expect(serializedDiagnostics).not.toContain('stack');
    expect(serializedDiagnostics).not.toContain('raw output');
    expect(serializedDiagnostics).not.toContain('objectKey');
    expect(serializedDiagnostics).not.toContain('storagePath');
    expect(serializedDiagnostics).not.toContain('private/runtime');
    expect(serializedDiagnostics).not.toContain('s3.example.com/private');
    expect(serializedDiagnostics).not.toContain('X-Amz-Signature');
    expect(serializedDiagnostics).not.toContain('SECRET_SIGNATURE');
    expect(serializedDiagnostics).not.toContain('SECRET_TOKEN');
    expect(serializedDiagnostics).not.toContain('LOG_SECRET');
    expect(serializedDiagnostics).not.toContain('LOG_TOKEN');
    expect(serializedDiagnostics).not.toContain('API Key');
    expect(serializedDiagnostics).not.toContain('api key');
    expect(serializedDiagnostics).not.toContain('api_key');
    expect(serializedDiagnostics).not.toContain('access key');
    expect(serializedDiagnostics).not.toContain('secret key');
    expect(serializedDiagnostics).not.toContain('SECRET_API_KEY');
    expect(serializedDiagnostics).not.toContain('SECOND_SECRET_API_KEY');
    expect(serializedDiagnostics).not.toContain('THIRD_SECRET_API_KEY');
    expect(serializedDiagnostics).not.toContain('ACCESS_SECRET_KEY');
    expect(serializedDiagnostics).not.toContain('SECRET_KEY_VALUE');
    expect(serializedDiagnostics).not.toContain('base64');

    expect(JSON.stringify(backendToolCall.model)).not.toContain('diagnostics');
    expect(JSON.stringify(backendToolCall.display)).not.toContain('diagnostics');
    expect(JSON.stringify(frontendToolCall)).not.toContain('diagnostics');
    expect(JSON.stringify(frontendToolCall)).not.toContain('"internal"');
  });

  it('sanitizes externally supplied internal trace before backend persistence', () => {
    const backendToolCall = toBackendToolCall({
      id: 'runtime_tool_trace',
      type: 'tool',
      name: 'Runtime',
      status: 'error',
      model: { content: 'ok', output: { kind: 'runtime' } },
      output: { summary: 'ok' },
      internal: {
        trace: {
          callId: 'call_1',
          toolName: 'Runtime',
          status: 'error',
          output: { kind: 'runtime' },
          inputSummary: [
            'API Key: SECRET_API_KEY',
            'api key=SECOND_SECRET_API_KEY',
            'api_key=THIRD_SECRET_API_KEY',
            'access key: ACCESS_SECRET_KEY',
          ].join('\n'),
          outputSummary: [
            'signed https://s3.example.com/private/out.pdf?X-Amz-Signature=SECRET_SIGNATURE&X-Amz-Credential=SECRET_CREDENTIAL',
            'stdout raw log',
            'stderr raw error',
            'objectKey=private/runtime/out.pdf',
            'storagePath=/private/runtime/out.pdf',
            `data:image/png;base64,${'A'.repeat(1500)}`,
          ].join('\n'),
          errorMessage:
            'stack: Error at /tmp/runtime/worker.ts raw log token=SECRET_TOKEN API Key: SECRET_API_KEY',
          errorSummary:
            'stderr raw error signed https://s3.example.com/private/out.pdf?X-Amz-Signature=SECRET_SIGNATURE',
          fileRefs: ['output_file_1'],
        },
      },
    });

    expect(backendToolCall.internal.trace).toMatchObject({
      callId: 'call_1',
      toolName: 'Runtime',
      output: { kind: 'runtime' },
      status: 'error',
      fileRefs: ['output_file_1'],
      errorSummary: expect.any(String),
    });

    const serializedTrace = JSON.stringify(backendToolCall.internal.trace);
    expect(serializedTrace).not.toContain('API Key');
    expect(serializedTrace).not.toContain('api key');
    expect(serializedTrace).not.toContain('api_key');
    expect(serializedTrace).not.toContain('access key');
    expect(serializedTrace).not.toContain('SECRET_API_KEY');
    expect(serializedTrace).not.toContain('SECOND_SECRET_API_KEY');
    expect(serializedTrace).not.toContain('THIRD_SECRET_API_KEY');
    expect(serializedTrace).not.toContain('ACCESS_SECRET_KEY');
    expect(serializedTrace).not.toContain('s3.example.com/private/out.pdf');
    expect(serializedTrace).not.toContain('X-Amz-Signature');
    expect(serializedTrace).not.toContain('X-Amz-Credential');
    expect(serializedTrace).not.toContain('SECRET_SIGNATURE');
    expect(serializedTrace).not.toContain('SECRET_CREDENTIAL');
    expect(serializedTrace).not.toContain('stdout');
    expect(serializedTrace).not.toContain('stderr');
    expect(serializedTrace).not.toContain('stack');
    expect(serializedTrace).not.toContain('raw log');
    expect(serializedTrace).not.toContain('objectKey');
    expect(serializedTrace).not.toContain('storagePath');
    expect(serializedTrace).not.toContain('private/runtime');
    expect(serializedTrace).not.toContain('SECRET_TOKEN');
    expect(serializedTrace).not.toContain('SECRET_SIGNATURE');
    expect(serializedTrace).not.toContain('base64');
  });

  it('compacts file parsing results to file metadata and core summary', () => {
    const sourceFileId = 'file_dddddddddddddddddddddddd';
    const outputFileId = 'file_eeeeeeeeeeeeeeeeeeeeeeee';
    const model = buildModelPayload(
      {
        fileId: sourceFileId,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        pageCount: 12,
        summary: '这是一份季度报告摘要。',
        fileAssets: [
          {
            type: 'document',
            fileId: outputFileId,
            name: 'summary.docx',
            mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ],
      },
      { displayName: '文件解析' },
    );

    expect(model.content).toContain('文件解析摘要');
    expect(model.content).toContain('文件名：report.pdf');
    expect(model.content).toContain('类型：application/pdf');
    expect(model.content).toContain('页数：12');
    expect(model.content).not.toContain('fileId');
    expect(JSON.stringify(model)).not.toContain(sourceFileId);
    expect(model.content).toContain('核心摘要：这是一份季度报告摘要。');
    expect(model.content).toContain('fileRef=output_file_1');
    expect(model.content).toContain('name=summary.docx');
    expect(JSON.stringify(model)).not.toContain(outputFileId);
  });

  it('preserves line boundaries in parsed text so the model can reason about rows', () => {
    const model = buildModelPayload('标题\n\n唯一标记：QA_DELTA\n苹果 3 个\n梨 5 个', {
      toolName: 'file_analyze',
      output: { kind: 'file_parse' },
    });

    expect(model.content).toContain('标题\n\n唯一标记：QA_DELTA\n苹果 3 个\n梨 5 个');
    expect(model.content.split('\n').filter(Boolean)).toHaveLength(5);
  });

  it('compacts media generation results without URL or base64 in model content', () => {
    const fileId = 'file_ffffffffffffffffffffffff';
    const model = buildModelPayload(
      {
        content: `已生成图片 data:image/png;base64,${'A'.repeat(1500)} 下载 /api/files/file_secret/download 预览 /api/files/file_secret/preview`,
        fileAssets: [
          {
            type: 'image',
            fileId,
            name: 'image.png',
            mime: 'image/png',
            size: 4096,
            downloadUrl: `/api/files/${fileId}/download`,
          },
        ],
      },
      { displayName: '图片生成' },
    );

    expect(model.content).toContain('媒体生成结果');
    expect(model.content).toContain('fileRef=output_image_1');
    expect(model.content).toContain('name=image.png');
    expect(model.content).toContain('type=image');
    expect(JSON.stringify(model)).not.toContain(fileId);
    expect(model.content).not.toContain(`/api/files/${fileId}/download`);
    expect(model.content).not.toContain('/api/files/file_secret/download');
    expect(model.content).not.toContain('/api/files/file_secret/preview');
    expect(model.content).not.toContain('base64');
    expect(model.content).not.toContain('AAAA');
  });

  it('keeps image analysis text out of media generation compaction', () => {
    const model = buildModelPayload(
      {
        content: '这张图片里有一只猫，背景是窗台。',
      },
      { toolName: 'image_analyze', displayName: '图片分析' },
    );

    expect(model.content).toContain('这张图片里有一只猫');
    expect(model.content).not.toContain('媒体生成结果');
  });

  it('uses declared output kind before name-based compaction heuristics', () => {
    const fileId = 'file_gggggggggggggggggggggggg';
    const layered = createLayeredToolResult({
      id: 'tool_declared_media',
      type: 'tool',
      name: '普通文件工具',
      status: 'success',
      output: { kind: 'media_generate' },
      rawOutput: {
        content: '已完成，下载 https://cdn.example.com/private.png',
        files: [
          {
            type: 'image',
            fileId,
            name: 'result.png',
            mimeType: 'image/png',
            role: 'final',
            url: 'https://cdn.example.com/private.png',
          },
        ],
      },
    });

    expect(layered.output?.kind).toBe('media_generate');
    expect(layered.model?.output?.kind).toBe('media_generate');
    expect(layered.model?.content).toContain('媒体生成结果');
    expect(layered.model?.content).toContain('fileRef=output_image_1');
    expect(layered.model?.content).toContain('name=result.png');
    expect(layered.model?.files?.[0]).toMatchObject({
      fileRef: 'output_image_1',
      name: 'result.png',
      mime: 'image/png',
      type: 'image',
    });
    expect(layered.model).not.toHaveProperty('fileAssets');
    expect(layered.model).not.toHaveProperty('attachments');
    expect(JSON.stringify(layered.model)).not.toContain(fileId);
    expect(layered.internal.fileRefs?.entries[0]).toMatchObject({
      fileRef: 'output_image_1',
      fileId,
      name: 'result.png',
      mime: 'image/png',
    });
    expect(layered.model?.content).not.toContain('https://cdn.example.com/private.png');
  });

  it('keeps internal fileRef mappings on backend tool calls while frontend projection strips them', () => {
    const fileId = 'file_hhhhhhhhhhhhhhhhhhhhhhhh';
    const layered = createLayeredToolResult({
      id: 'tool_backend_file_refs',
      type: 'tool',
      name: '图片生成',
      status: 'success',
      output: { kind: 'media_generate' },
      rawOutput: {
        files: [
          {
            type: 'image',
            fileId,
            name: 'backend-result.png',
            mime: 'image/png',
          },
        ],
      },
    });

    const backendToolCall = toBackendToolCall(layered);
    const frontendToolCall = toFrontendToolCall(backendToolCall);
    const frontendMessage = stringifyFrontendMessage({
      role: 'assistant',
      rounds: [{ toolCalls: [backendToolCall] }],
    });

    expect(backendToolCall.internal.fileRefs?.entries[0]).toMatchObject({
      fileRef: 'output_image_1',
      fileId,
    });
    expect(frontendToolCall).not.toHaveProperty('internal');
    expect(frontendMessage).not.toContain('"internal"');
  });

  it('canonicalizes format-specific final roles before persisting file refs', () => {
    const fileId = 'file_pptxpptxpptxpptxpptxpptx';
    const layered = createLayeredToolResult({
      id: 'tool_final_pptx',
      type: 'tool',
      name: 'PPT 演示文稿',
      status: 'success',
      output: { kind: 'runtime' },
      rawOutput: {
        files: [
          {
            type: 'document',
            fileId,
            name: 'deck.pptx',
            mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            role: 'final',
          },
        ],
      },
    });

    expect(layered.internal.fileRefs?.entries[0]).toMatchObject({
      fileRef: 'output_file_1',
      fileId,
      role: 'final',
    });
    expect(layered.model?.files?.[0]).toMatchObject({
      fileRef: 'output_file_1',
      role: 'final',
    });
  });

  it('preserves distinct user upload file refs for repeated image names', () => {
    const firstFileId = 'file_aaaaaaaaaaaaaaaaaaaaaaaa';
    const secondFileId = 'file_bbbbbbbbbbbbbbbbbbbbbbbb';
    const frontendMessage = JSON.parse(
      stringifyFrontendMessage(
        {
          role: 'user',
          rounds: [
            {
              text: '看这两张图',
              toolCalls: [
                {
                  id: 'user_upload_1',
                  name: 'user_upload',
                  status: 'success',
                  output: {
                    files: [
                      {
                        type: 'image',
                        fileId: firstFileId,
                        name: 'image.png',
                        mime: 'image/png',
                      },
                      {
                        type: 'image',
                        fileId: secondFileId,
                        name: 'image.png',
                        mime: 'image/png',
                      },
                    ],
                  },
                  internal: {
                    fileRefs: {
                      entries: [
                        {
                          fileRef: 'attachment_1',
                          fileId: firstFileId,
                          type: 'image',
                          name: 'image.png',
                          mime: 'image/png',
                        },
                        {
                          fileRef: 'attachment_2',
                          fileId: secondFileId,
                          type: 'image',
                          name: 'image.png',
                          mime: 'image/png',
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
        { exposePrivateFileDownloads: true },
      ),
    );

    const files = frontendMessage.rounds[0].toolCalls[0].output.files;
    expect(files).toHaveLength(2);
    expect(files.map((item: any) => item.fileId)).toEqual([firstFileId, secondFileId]);
    expect(files.map((item: any) => item.fileRef)).toEqual(['attachment_1', 'attachment_2']);
  });

  it('keeps workflow intermediate files for model chaining but hides them from frontend files', () => {
    const fileId = 'file_pppppppppppppppppppppppp';
    const layered = createLayeredToolResult({
      id: 'tool_intermediate_ppt',
      type: 'tool',
      name: '演示文稿：生成工作流中间文件',
      status: 'success',
      output: { kind: 'runtime' },
      rawOutput: {
        content: 'Workflow intermediate file created for model chaining.',
        files: [
          {
            type: 'document',
            fileId,
            name: 'slide-1.pptx',
            mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            role: 'intermediate',
          },
        ],
      },
    });

    const backendToolCall = toBackendToolCall(layered);
    const frontendToolCall = toFrontendToolCall(backendToolCall);
    const feedback = getToolModelContent(backendToolCall);

    expect(layered.model?.files?.[0]).toMatchObject({
      fileRef: 'output_file_1',
      name: 'slide-1.pptx',
      role: 'intermediate',
    });
    expect(backendToolCall.internal.fileRefs?.entries[0]).toMatchObject({
      fileRef: 'output_file_1',
      fileId,
      role: 'intermediate',
    });
    expect(feedback).toContain('fileRef=output_file_1');
    expect(feedback).toContain('role=intermediate');
    expect(frontendToolCall.output.files || []).toEqual([]);
    expect(JSON.stringify(frontendToolCall)).not.toContain('slide-1.pptx');
    expect(JSON.stringify(frontendToolCall)).not.toContain(fileId);
  });

  it('hides internal file processor outputs from frontend while keeping model file refs', () => {
    const fileId = 'file_qqqqqqqqqqqqqqqqqqqqqqqq';
    const layered = createLayeredToolResult({
      id: 'tool_internal_file',
      type: 'tool',
      name: '文件处理',
      status: 'success',
      output: { kind: 'generic' },
      rawOutput: {
        content: 'Internal renamed file created.',
        files: [
          {
            type: 'document',
            fileId,
            name: 'renamed.pdf',
            mime: 'application/pdf',
            role: 'intermediate',
          },
        ],
      },
    });

    const backendToolCall = toBackendToolCall(layered);
    const frontendToolCall = toFrontendToolCall(backendToolCall);
    const feedback = getToolModelContent(backendToolCall);

    expect(backendToolCall.internal.fileRefs?.entries[0]).toMatchObject({
      fileRef: 'output_file_1',
      fileId,
      role: 'intermediate',
    });
    expect(feedback).toContain('fileRef=output_file_1');
    expect(frontendToolCall.output.files || []).toEqual([]);
    expect(JSON.stringify(frontendToolCall)).not.toContain('renamed.pdf');
    expect(JSON.stringify(frontendToolCall)).not.toContain(fileId);
  });

  it('strips FileAsset handles from default frontend tool projections', () => {
    const fileId = 'file_iiiiiiiiiiiiiiiiiiiiiiii';
    const backendToolCall = {
      id: 'tool_frontend_file_refs',
      name: '图片生成',
      status: 'success',
      type: 'tool',
      internal: {
        fileRefs: {
          entries: [{ fileRef: 'output_image_1', fileId, role: 'final' }],
          counters: {
            attachment: 0,
            output_image: 1,
            output_file: 0,
            previous_file: 0,
          },
        },
      },
      output: {
        summary: `生成完成，预览 /api/files/${fileId}/preview`,
        files: [
          {
            id: fileId,
            fileId,
            type: 'image',
            name: 'result.png',
            mime: 'image/png',
            role: 'final',
            previewUrl: `/api/files/${fileId}/preview`,
            downloadUrl: `/api/files/${fileId}/download`,
          },
        ],
        fileAssets: [
          {
            id: fileId,
            fileId,
            name: 'asset.png',
            role: 'final',
            downloadUrl: `/api/files/${fileId}/download`,
          },
        ],
        attachments: [
          {
            id: fileId,
            fileId,
            name: 'attachment.png',
            role: 'final',
            previewUrl: `/api/files/${fileId}/preview`,
          },
        ],
      },
    };

    const frontendToolCall = toFrontendToolCall(backendToolCall);
    const frontendMessage = stringifyFrontendMessage({
      role: 'assistant',
      rounds: [{ toolCalls: [backendToolCall] }],
    });
    const serializedToolCall = JSON.stringify(frontendToolCall);

    for (const key of ['output', 'display'] as const) {
      const serializedProjection = JSON.stringify(frontendToolCall[key]);
      expect(serializedProjection).not.toContain('"internal"');
      expect(serializedProjection).not.toContain(fileId);
      expect(serializedProjection).not.toContain(`/api/files/${fileId}/preview`);
      expect(serializedProjection).not.toContain(`/api/files/${fileId}/download`);
      expect(frontendToolCall[key]).not.toHaveProperty('fileAssets');
      expect(frontendToolCall[key]).not.toHaveProperty('attachments');
    }
    expect(frontendToolCall.output.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileRef: 'output_image_1',
          privateDownloadHidden: true,
        }),
      ]),
    );
    expect(frontendToolCall.output.files[0]).toEqual(
      expect.objectContaining({
        privateDownloadHidden: true,
      }),
    );
    expect(
      frontendToolCall.output.files.find((item: any) => item.fileRef === 'output_image_1'),
    ).toMatchObject({
      fileRef: 'output_image_1',
      privateDownloadHidden: true,
    });
    expect(serializedToolCall).toContain('output_image_1');
    expect(serializedToolCall).not.toContain('model');
    expect(serializedToolCall).not.toContain('"internal"');
    expect(frontendMessage).not.toContain('"internal"');
    expect(frontendMessage).not.toContain(fileId);
    expect(frontendMessage).not.toContain(`/api/files/${fileId}/preview`);
    expect(frontendMessage).not.toContain(`/api/files/${fileId}/download`);
  });

  it('rebuilds model fileRef lines from stored internal refs after frontend output stripping', () => {
    const fileId = 'file_jjjjjjjjjjjjjjjjjjjjjjjj';
    const content = getToolModelContent({
      id: 'tool_stored_backend_file_refs',
      name: '图片生成',
      status: 'success',
      type: 'tool',
      output: {
        summary: '图片已经生成',
        files: [
          {
            type: 'image',
            title: 'result.png',
            visibility: 'private',
            privateDownloadHidden: true,
          },
        ],
      },
      internal: {
        fileRefs: {
          entries: [
            {
              fileRef: 'output_image_1',
              fileId,
              name: 'result.png',
              mime: 'image/png',
              type: 'image',
              origin: 'tool_output',
            },
          ],
          counters: {
            attachment: 0,
            output_image: 1,
            output_file: 0,
            previous_file: 0,
          },
        },
      },
    });

    expect(content).toContain('fileRef=output_image_1');
    expect(content).toContain('name=result.png');
    expect(content).not.toContain(fileId);
    expect(content).not.toContain('/api/files/');
  });

  it('does not reconstruct model observations from a public display payload', () => {
    const content = getToolModelContent({
      output: {
        kind: 'search',
        results: [
          { title: '结果一', url: 'https://example.com/a', snippet: 'A' },
          { title: '结果二', url: 'https://example.com/b', snippet: 'B' },
        ],
      },
    });

    expect(content).toBe('工具执行完成');
    expect(content).not.toContain('结果一');
  });

  it('compacts generic long content with head and tail instead of full payload', () => {
    const model = buildModelPayload({
      message: `${'这是很长的普通内容。'.repeat(260)}结尾重点`,
    });

    expect(model.content).toContain('已省略');
    expect(model.content).toContain('这是很长的普通内容');
    expect(model.content).toContain('结尾重点');
  });

  function sanitizeToolOutputForFrontend(output: Record<string, unknown>) {
    return sanitizeFrontendMessage(
      {
        role: 'assistant',
        rounds: [{ toolCalls: [{ id: 'tool_1', name: '工具', status: 'success', output }] }],
      },
      { exposePrivateFileDownloads: false },
    );
  }

  it('strips FileAsset ids and internal file links on frontend projection', () => {
    const sanitized = sanitizeToolOutputForFrontend({
      fileAssets: [
        {
          fileId: 'file_public',
          name: 'public.pdf',
          role: 'final',
          visibility: 'public',
          downloadUrl: '/api/files/public/file_public/download',
        },
        {
          fileId: 'file_private',
          name: 'private.pdf',
          role: 'final',
          visibility: 'private',
          downloadUrl: '/api/files/file_private/download',
        },
      ],
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('file_public');
    expect(serialized).not.toContain('/api/files/public/file_public/download');
    expect(serialized).not.toContain('/api/files/file_private/download');
    expect(serialized).toContain('privateDownloadHidden');
  });

  it('strips private FileAsset ids and preview/download URLs from frontend projection', () => {
    const sanitized = sanitizeToolOutputForFrontend({
      content: '私有文件 /api/files/file_secret123/preview 和 /api/files/file_secret123/download',
      files: [
        {
          id: 'file_secret123',
          fileId: 'file_secret123',
          name: 'secret.pdf',
          role: 'final',
          visibility: 'private',
          previewUrl: '/api/files/file_secret123/preview',
          downloadUrl: '/api/files/file_secret123/download',
        },
      ],
      fileAssets: [
        {
          fileId: 'file_secret123',
          role: 'final',
          publicUrl: '/api/files/file_secret123/preview',
        },
      ],
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('file_secret123');
    expect(serialized).not.toContain('/api/files/file_secret123');
    expect(serialized).toContain('privateDownloadHidden');
  });

  it('does not trust public visibility when the file URL is still private', () => {
    const sanitized = sanitizeToolOutputForFrontend({
      fileAssets: [
        {
          fileId: 'file_confused',
          name: 'confused.pdf',
          role: 'final',
          visibility: 'public',
          downloadUrl: '/api/files/file_confused/download',
        },
      ],
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('/api/files/file_confused/download');
    expect(serialized).toContain('privateDownloadHidden');
  });

  it('strips private FileAsset preview URLs from frontend projection', () => {
    const sanitized = sanitizeToolOutputForFrontend({
      content: '预览 /api/files/file_preview/preview',
      fileAssets: [
        {
          fileId: 'file_preview',
          name: 'preview.pdf',
          role: 'preview',
          visibility: 'private',
          url: '/api/files/file_preview/preview',
        },
      ],
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('/api/files/file_preview/preview');
    expect(serialized).toContain('privateDownloadHidden');
  });

  it('strips private FileAsset preview URLs from arbitrary frontend fields', () => {
    const sanitized = sanitizeToolOutputForFrontend({
      previewUrl: '/api/files/file_preview/preview',
      nested: {
        previewUrl: 'https://files.example.com/api/files/file_abs/preview',
      },
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('/api/files/file_preview/preview');
    expect(serialized).not.toContain('files.example.com/api/files/file_abs/preview');
  });

  it('re-sanitizes existing model content before tool loop feedback', () => {
    const content = getToolModelContent({
      model: {
        content: '下载 /api/files/file_secret/download，预览 /api/files/file_secret/preview',
        files: [
          {
            type: 'document',
            fileRef: 'output_file_1',
            name: 'secret.pdf',
            mime: 'application/pdf',
          },
        ],
      },
    });

    expect(content).not.toContain('file_secret');
    expect(content).not.toContain('fileId');
    expect(content).not.toContain('/api/files/file_secret/download');
    expect(content).not.toContain('/api/files/file_secret/preview');
  });

  it('re-sanitizes direct stored runtime model content before tool loop feedback', () => {
    const content = getToolModelContent({
      name: 'Runtime',
      status: 'success',
      type: 'tool',
      model: {
        output: { kind: 'runtime' },
        content: [
          `签名地址 https://s3.example.com/private/output.png?X-Amz-Signature=SECRET_SIGNATURE&X-Amz-Credential=SECRET_CREDENTIAL`,
          '私有预览 /api/files/file_secret/preview',
          'objectKey=private/runtime/output.png',
          'storagePath=/private/runtime/output.png',
          'stdout: raw runtime log',
          'stderr: raw runtime error',
          'stack: Error: BOOM',
          `token=SECRET_TOKEN api_key=SECRET_API_KEY data:image/png;base64,${'A'.repeat(1500)}`,
        ].join('\n'),
        files: [
          {
            type: 'document',
            fileRef: 'output_file_1',
            name: 'result.pdf',
            mime: 'application/pdf',
          },
        ],
      },
    });

    expect(content).toContain('fileRef=output_file_1');
    expect(content).not.toContain('s3.example.com/private/output.png');
    expect(content).not.toContain('X-Amz-Signature');
    expect(content).not.toContain('X-Amz-Credential');
    expect(content).not.toContain('SECRET_SIGNATURE');
    expect(content).not.toContain('SECRET_CREDENTIAL');
    expect(content).not.toContain('/api/files/file_secret/preview');
    expect(content).not.toContain('objectKey');
    expect(content).not.toContain('storagePath');
    expect(content).not.toContain('private/runtime/output.png');
    expect(content).not.toContain('stdout');
    expect(content).not.toContain('stderr');
    expect(content).not.toContain('stack');
    expect(content).not.toContain('raw runtime');
    expect(content).not.toContain('SECRET_TOKEN');
    expect(content).not.toContain('SECRET_API_KEY');
    expect(content).not.toContain('base64');
  });

  it('re-sanitizes stored model payloads before backend persistence and tool feedback', () => {
    const legacyInternalFileRefsKey = ['internal', 'FileRefs'].join('');
    const unsafeModel = {
      content: `签名地址 https://s3.example.com/private/output.png?X-Amz-Signature=SECRET_SIGNATURE&X-Amz-Credential=SECRET_CREDENTIAL data:image/png;base64,${'A'.repeat(1500)}`,
      output: { kind: 'runtime' },
      files: [
        {
          type: 'document',
          fileRef: 'output_file_1',
          name: 'result.pdf',
          mime: 'application/pdf',
        },
      ],
      [legacyInternalFileRefsKey]: { entries: [{ fileId: 'file_should_not_persist' }] },
      fileAssets: [{ fileId: 'file_should_not_persist' }],
      attachments: [{ fileId: 'file_should_not_persist' }],
    };
    const backendToolCall = toBackendToolCall({
      id: 'tool_model_resanitize',
      name: 'Runtime',
      status: 'success',
      type: 'tool',
      model: unsafeModel,
      output: { summary: 'visible' },
    });
    const feedback = getToolModelContent(backendToolCall);
    const serializedModel = JSON.stringify(backendToolCall.model);

    expect(backendToolCall.model.output.kind).toBe('runtime');
    expect(serializedModel).toContain('output_file_1');
    expect(serializedModel).not.toContain('SECRET_SIGNATURE');
    expect(serializedModel).not.toContain('SECRET_CREDENTIAL');
    expect(serializedModel).not.toContain('s3.example.com/private/output.png');
    expect(serializedModel).not.toContain('base64');
    expect(serializedModel).not.toContain('file_should_not_persist');
    expect(backendToolCall.model).not.toHaveProperty(legacyInternalFileRefsKey);
    expect(backendToolCall.model).not.toHaveProperty('fileAssets');
    expect(backendToolCall.model).not.toHaveProperty('attachments');
    expect(feedback).not.toContain('SECRET_SIGNATURE');
    expect(feedback).not.toContain('s3.example.com/private/output.png');
    expect(feedback).not.toContain('base64');
  });

  it('projects layered ToolResult without exposing modelContent or hidden assets to frontend', () => {
    const layered = createLayeredToolResult({
      id: 'tool_runtime_v1',
      type: 'tool',
      name: 'External Runtime',
      status: 'success',
      rawOutput: {
        summary: 'Runtime 已完成。',
        content: '模型专用摘要 stdout: raw runtime log',
        files: [
          {
            fileId: 'file_final_1',
            name: 'result.pdf',
            role: 'final',
            mime: 'application/pdf',
            size: 1024,
            downloadUrl: '/api/files/file_final_1/download',
          },
          {
            fileId: 'file_source_1',
            name: 'source.tex',
            role: 'source',
            mime: 'text/x-tex',
          },
        ],
        providerPayload: { token: 'SECRET' },
      },
      output: { kind: 'runtime' },
      toolResult: {
        status: 'success',
        assets: [
          {
            fileId: 'file_final_1',
            role: 'final',
            displayName: 'result.pdf',
            mimeType: 'application/pdf',
            size: 1024,
          },
          {
            fileId: 'file_source_1',
            role: 'source',
            displayName: 'source.tex',
            mimeType: 'text/x-tex',
          },
        ],
      },
    });

    expect(layered.toolResult).not.toHaveProperty('version');
    expect(layered.toolResult.assets?.map(asset => asset.role)).toEqual(['final', 'source']);
    expect(getToolModelContent(layered)).toContain('Runtime 执行摘要');
    expect(getToolModelContent(layered)).not.toContain('raw runtime log');

    const frontend = toFrontendToolCall(layered);
    const serialized = JSON.stringify(frontend);

    expect(frontend.display.summary).toBe('Runtime 已完成。');
    expect(frontend.assets).toEqual([
      {
        fileId: 'file_final_1',
        role: 'final',
        displayName: 'result.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      },
    ]);
    expect(frontend.output.files).toEqual([
      expect.objectContaining({
        id: 'file_final_1',
        fileId: 'file_final_1',
        title: 'result.pdf',
        mime: 'application/pdf',
        role: 'final',
        visibility: 'private',
        privateDownloadHidden: true,
        privatePreviewHidden: true,
      }),
    ]);
    expect(serialized).not.toContain('modelContent');
    expect(serialized).not.toContain('file_source_1');
    expect(serialized).not.toContain('/api/files/file_final_1/download');
    expect(serialized).not.toContain('providerPayload');
    expect(serialized).not.toContain('SECRET');
  });

  it('uses ToolResult assets to keep stripped private media files recoverable', () => {
    const fileId = 'file_assetrecoveryvideo01';
    const layered = createLayeredToolResult({
      id: 'tool_asset_recovery',
      type: 'tool',
      name: '视频生成',
      status: 'success',
      rawOutput: {
        summary: '视频已生成',
        files: [
          {
            fileId,
            name: 'clip.mp4',
            role: 'final',
            mime: 'video/mp4',
            size: 8192,
            visibility: 'private',
            downloadUrl: `/api/files/${fileId}/download`,
          },
        ],
      },
      output: { kind: 'media_generate' },
      toolResult: {
        status: 'success',
        assets: [
          { fileId, role: 'final', displayName: 'clip.mp4', mimeType: 'video/mp4', size: 8192 },
        ],
      },
    });

    const frontend = toFrontendToolCall(toBackendToolCall(layered));
    const file = frontend.output.files[0];

    expect(file).toMatchObject({
      type: 'video',
      id: fileId,
      fileId,
      title: 'clip.mp4',
      mime: 'video/mp4',
      mimeType: 'video/mp4',
      size: 8192,
      visibility: 'private',
      privateDownloadHidden: true,
      privatePreviewHidden: true,
    });
    expect(JSON.stringify(frontend)).not.toContain('/api/files/');
  });

  it('keeps backend ToolResult when projecting a layered result for RuntimeCore events', () => {
    const layered = createLayeredToolResult({
      id: 'tool_runtime_backend_v1',
      type: 'tool',
      name: 'External Runtime',
      status: 'error',
      rawOutput: {
        error: 'legacy fallback error',
        runtimeLog: 'Bearer LOG_SECRET',
        stdout: 'STDOUT_SECRET',
        rawPayload: { apiKey: 'SECRET_API_KEY' },
      },
      output: { kind: 'runtime' },
      toolResult: {
        status: 'error',
        modelContent: 'Runtime failed safely for model.',
        display: { summary: 'Runtime 执行失败。' },
        assets: [
          {
            fileId: 'file_runtimefinalbackendv1',
            role: 'final',
            displayName: 'report.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          },
        ],
        trace: {
          code: 'RUNTIME_FAILED',
          message: 'Runtime task failed safely.',
          retryable: true,
          diagnostics: {
            provider: 'external_runtime',
            runtimeLog: 'Bearer LOG_SECRET',
            stdout: 'STDOUT_SECRET',
            stderr: 'STDERR_SECRET',
            rawPayload: { apiKey: 'SECRET_API_KEY' },
          },
        },
      },
    });

    const backend = toBackendToolCall(layered);
    const frontend = toFrontendToolCall(backend);

    expect(backend.toolResult).toMatchObject({
      status: 'error',
      assets: [
        {
          fileId: 'file_runtimefinalbackendv1',
          role: 'final',
          displayName: 'report.pdf',
          mimeType: 'application/pdf',
          size: 2048,
        },
      ],
      trace: {
        code: 'RUNTIME_FAILED',
        message: 'Runtime task failed safely.',
        retryable: true,
      },
    });
    expect(frontend.assets).toEqual([
      {
        fileId: 'file_runtimefinalbackendv1',
        role: 'final',
        displayName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
    ]);
    expect(frontend.trace).toMatchObject({
      code: 'RUNTIME_FAILED',
      message: 'Runtime task failed safely.',
      retryable: true,
    });
    const serialized = JSON.stringify({ backend, frontend });
    expect(serialized).not.toContain('runtimeLog');
    expect(serialized).not.toContain('STDOUT_SECRET');
    expect(serialized).not.toContain('STDERR_SECRET');
    expect(serialized).not.toContain('SECRET_API_KEY');
    expect(serialized).not.toContain('rawPayload');
  });

  it('infers simplified output aspect ratio from tool input', () => {
    expect(enrichOutputHintWithInput({ type: 'image' }, { size: '1536x1024' })).toEqual({
      type: 'image',
      aspectRatio: '3:2',
    });
    expect(enrichOutputHintWithInput({ type: 'video' }, { ratio: '16:9' })).toEqual({
      type: 'video',
      aspectRatio: '16:9',
    });
    expect(enrichOutputHintWithInput({ type: 'image' }, { width: 1024, height: 1024 })).toEqual({
      type: 'image',
      aspectRatio: '1:1',
    });
  });
});
