import { Logger } from '@nestjs/common';
import { createFileAssetMemoryFixture } from '../../../test/fixtures/file-asset-memory.fixture';
import { FileMaterializerService } from '../../fileAsset/materializer/file-materializer.service';
import { ModelGatewayMediaPreparerService } from '../../modelGateway/model-gateway-media-preparer.service';
import { OpenAIChatCompletionsAdapter } from '../../modelGateway/adapters/openai-chat-completions.adapter';
import { PrimitiveToolProvider } from '../primitives/primitive-tool.provider';
import { McpToolProvider } from '../../mcp/mcp-tool.provider';
import { normalizeMcpCallToolResult } from '../../mcp/mcp-client.service';
import { FileRefMappingStore } from '../../fileAsset/file-refs';
import {
  getToolModelContent,
  toBackendToolCall,
  toFrontendToolCall,
} from '../../chatLog/tool-result-payload';
import { decodeToolMediaBase64, storeToolMedia, TOOL_MEDIA_MAX_BYTES } from './tool-media';
import type { ToolExecutionContext } from './tool-provider.interface';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXcAAAAASUVORK5CYII=',
  'base64',
);
function wave(): Buffer {
  const buffer = Buffer.alloc(46);
  buffer.write('RIFF');
  buffer.writeUInt32LE(38, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(2, 40);
  return buffer;
}

/** 仅替换持久化 I/O；入库、权限、媒体读取与模型构造均使用生产实现。 */
function fixture() {
  const { rows, objects, files, storage } = createFileAssetMemoryFixture();
  const preparer = new ModelGatewayMediaPreparerService(
    files,
    new FileMaterializerService(files, storage as any),
  );
  const context: ToolExecutionContext = {
    toolCallId: 'call_media',
    fileRefMappingStore: new FileRefMappingStore(),
    input: {
      messages: [],
      config: {},
      context: {
        options: {
          userId: 7,
          conversationId: 11,
          __sandboxTurnPrepared: true,
          turnId: 'turn_media',
          messageId: 'message_media',
        },
      },
    },
  };
  const request = (content: any, capabilities: any = { vision: true, audioInput: true }) =>
    ({
      config: { protocol: 'openai_chat_completions', model: 'media-fixture', capabilities },
      purpose: 'agent_loop',
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_media', type: 'function', function: { name: 'read', arguments: '{}' } },
            { id: 'call_next', type: 'function', function: { name: 'ls', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_media', content },
        { role: 'tool', tool_call_id: 'call_next', content: 'directory empty' },
      ],
      fileContext: { actor: { id: 7 }, fileRefMapping: context.fileRefMappingStore!.snapshot() },
    }) as any;
  return { rows, objects, files, storage, preparer, context, request };
}

describe('private tool media through FileAsset and model gateway', () => {
  it.each(['primitive', 'mcp'])(
    'sends actual PNG from %s through assets to the model without storing base64 in messages',
    async (source: string) => {
      const f = fixture();
      let result: any;
      if (source === 'primitive') {
        const sandbox = {
          isSessionRetired: () => false,
          listDir: async () => [{ path: 'work/chart.png', type: 'file', size: png.length }],
          readFile: async () => png,
        };
        result = await new PrimitiveToolProvider(sandbox as any, f.files).execute(
          'read',
          { path: 'work/chart.png' },
          f.context,
        );
      } else {
        const client = {
          resolveServers: async () => ({
            servers: [
              {
                name: 'media',
                enabled: true,
                chat: true,
                work: false,
                allowTools: [] as string[],
                denyTools: [] as string[],
              },
            ],
            errors: [] as string[],
          }),
          listTools: async () => [{ name: 'render' }],
          callTool: async () =>
            normalizeMcpCallToolResult({
              content: [
                { type: 'text', text: 'chart' },
                { type: 'image', mimeType: 'image/png', data: png.toString('base64') },
              ],
            }),
        };
        const provider = new McpToolProvider(client as any, f.files);
        const [definition] = await provider.getToolDefinitions(f.context);
        result = await provider.execute(definition.function.name, {}, f.context);
      }
      expect(result.status).toBe('success');
      expect(f.rows.size).toBe(1);
      const record = [...f.rows.values()][0];
      expect(record).toMatchObject({
        userId: 7,
        turnId: 'turn_media',
        messageId: 'message_media',
        purpose: 'tool_media',
        status: 'active',
      });
      const persisted = JSON.parse(JSON.stringify(toBackendToolCall(result)));
      const wire = JSON.stringify(toFrontendToolCall(result));
      expect(JSON.stringify(persisted)).not.toContain(png.toString('base64'));
      expect(wire).not.toContain('base64');
      expect(wire).not.toContain('fileRefs');
      expect(wire).not.toContain('/Users/');
      expect(wire).not.toContain(record.objectKey);
      const content = getToolModelContent(persisted);
      expect(content[1]).toMatchObject({ type: 'image_file', file: { fileRef: 'output_image_1' } });
      const prepared = await f.preparer.prepare(f.request(content));
      const body = new OpenAIChatCompletionsAdapter(
        {} as any,
        { register: jest.fn() } as any,
      ).buildRequestBody(prepared, false);
      expect(body.messages.map((message: { role: string }) => message.role)).toEqual([
        'assistant',
        'tool',
        'tool',
        'user',
      ]);
      expect(body.messages[3].content[1].image_url.url).toBe(
        `data:image/png;base64,${png.toString('base64')}`,
      );
      expect(f.storage.getObjectStream).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(body.messages)).not.toContain(record.fileId);
    },
  );

  it('does not expose a storage failure while reading tool media', async () => {
    const f = fixture();
    const privateDetail = 'synthetic confidential object storage diagnostic';
    f.storage.putObject.mockRejectedValueOnce(new Error(privateDetail));
    const log = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    try {
      const provider = new PrimitiveToolProvider(
        {
          isSessionRetired: () => false,
          listDir: async () => [{ path: 'work/chart.png', type: 'file', size: png.length }],
          readFile: async () => png,
        } as any,
        f.files,
      );
      const result = await provider.execute('read', { path: 'work/chart.png' }, f.context);
      expect(f.storage.putObject).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('error');
      expect(getToolModelContent(result)).toContain('沙箱工具执行或交付失败');
      expect(JSON.stringify(result)).not.toContain(privateDetail);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateDetail);
    } finally {
      log.mockRestore();
    }
  });

  it('sends valid WAV audio as model audio content', async () => {
    const f = fixture();
    const buffer = wave();
    const stored = await storeToolMedia(f.files, {
      buffer,
      mime: 'audio/wav',
      name: 'clip.wav',
      sourceKey: 'audio',
      context: f.context,
    });
    const prepared = await f.preparer.prepare(f.request([stored.part]));
    const body = new OpenAIChatCompletionsAdapter(
      {} as any,
      { register: jest.fn() } as any,
    ).buildRequestBody(prepared, false);
    expect(body.messages[3].content[1]).toMatchObject({
      type: 'input_audio',
      input_audio: { data: buffer.toString('base64'), format: 'wav' },
    });
  });

  it('does not read bytes when unsupported, denied, deleted or outside the request media budget', async () => {
    const f = fixture();
    const stored = await storeToolMedia(f.files, {
      buffer: png,
      mime: 'image/png',
      name: 'chart.png',
      sourceKey: 'chart',
      context: f.context,
    });
    const requests = [
      f.request([stored.part], {}),
      f.request([stored.part]),
      f.request([stored.part]),
    ];
    requests[1].fileContext.actor.id = 8;
    requests[2].fileContext.fileRefMapping.entries = [];
    for (const protocol of ['anthropic_messages', 'openai_responses']) {
      const audioRequest = f.request([{ type: 'audio_file', file: { fileRef: 'output_image_1' } }]);
      audioRequest.config.protocol = protocol;
      requests.push(audioRequest);
    }
    for (const request of requests) {
      expect(JSON.stringify((await f.preparer.prepare(request)).messages)).not.toContain('base64');
    }
    f.rows.get(stored.asset.fileId)!.status = 'deleted';
    expect(
      JSON.stringify((await f.preparer.prepare(f.request([stored.part]))).messages),
    ).not.toContain('base64');
    expect(f.storage.getObjectStream).not.toHaveBeenCalled();
    f.rows.get(stored.asset.fileId)!.status = 'active';
    const oversized = Buffer.alloc(11 * 1024 * 1024);
    png.copy(oversized);
    f.objects.set(f.rows.get(stored.asset.fileId)!.objectKey, oversized);
    const result = await f.preparer.prepare(f.request([stored.part, stored.part]));
    expect((result.messages[1].content as any[])[1].type).toBe('text');
    expect(f.storage.getObjectStream).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed encoding, MIME mismatch and oversized media before storage', async () => {
    const f = fixture();
    for (const value of ['%%%%', 'YQ=', 'YQ==\n', 'YQ=A'])
      expect(() => decodeToolMediaBase64(value)).toThrow();
    for (const input of [
      { buffer: png, mime: 'image/jpeg' },
      { buffer: Buffer.from('wrong'), mime: 'audio/wav' },
      { buffer: Buffer.alloc(TOOL_MEDIA_MAX_BYTES + 1), mime: 'image/png' },
    ]) {
      await expect(
        storeToolMedia(f.files, { ...input, name: 'bad', sourceKey: 'bad', context: f.context }),
      ).rejects.toThrow();
    }
    expect(f.storage.putObject).not.toHaveBeenCalled();
  });
});
