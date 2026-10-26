import { FileAssetService } from '../../fileAsset/fileAsset.service';
import { detectAvatarImageType } from '../../fileAsset/fileAsset.util';
import type { ToolExecutionContext } from './tool-provider.interface';
import type { AgentToolAsset, AgentToolModelContent } from '../../chatLog/agent-tool-result.types';

export const TOOL_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const TOOL_MEDIA_TOTAL_BYTES = 20 * 1024 * 1024;
export const TOOL_MEDIA_MAX_COUNT = 8;

export function decodeToolMediaBase64(data: unknown): Buffer {
  if (
    typeof data !== 'string' ||
    !data.length ||
    data.length > Math.ceil(TOOL_MEDIA_MAX_BYTES / 3) * 4 ||
    data.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(data)
  )
    throw new Error('工具媒体编码或大小无效');
  const buffer = Buffer.from(data, 'base64');
  if (buffer.toString('base64') !== data || buffer.length > TOOL_MEDIA_MAX_BYTES)
    throw new Error('工具媒体编码或大小无效');
  return buffer;
}

/** 两个工具 Provider 共用的私有媒体入口；原始字节不进入结果投影。 */
export async function storeToolMedia(
  fileAssets: FileAssetService,
  input: {
    buffer: Buffer;
    name: string;
    mime: string;
    sourceKey: string;
    context: ToolExecutionContext;
  },
): Promise<{ part: Exclude<AgentToolModelContent, string>[number]; asset: AgentToolAsset }> {
  const { buffer, context } = input;
  if (!buffer.length || buffer.length > TOOL_MEDIA_MAX_BYTES) throw new Error('工具媒体大小无效');
  const mime = input.mime.toLowerCase().split(';')[0].trim();
  const isImage = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
  const wav =
    mime === 'audio/wav' &&
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WAVE';
  const mp3 =
    mime === 'audio/mpeg' &&
    buffer.length >= 3 &&
    (buffer.subarray(0, 3).toString() === 'ID3' ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0));
  if (isImage ? !detectAvatarImageType(buffer, mime) : !wav && !mp3)
    throw new Error('工具媒体类型或文件内容无效');
  const options = context.input.context.options;
  const store = context.fileRefMappingStore;
  if (!store || !options) throw new Error('工具媒体缺少宿主文件上下文');
  const userId = Number(options.userId) || undefined;
  const projection = await fileAssets.createFromBuffer({
    buffer,
    name: input.name,
    mime,
    userId,
    visitorId: userId ? undefined : options.visitorId,
    messageId: options.messageId,
    delivery: { turnId: options.turnId, sourceKey: input.sourceKey },
    purpose: 'tool_media',
    category: 'media',
    visibility: 'private',
    signal: context.signal,
  });
  const ref = store.registerFile(projection.fileId, {
    origin: 'tool_output',
    name: projection.name,
    mime,
    type: isImage ? 'image' : 'audio',
    size: projection.size,
    role: 'preview',
    sourceToolCallId: context.toolCallId,
  });
  return {
    part: {
      type: isImage ? 'image_file' : 'audio_file',
      file: { fileRef: ref.fileRef, name: projection.name, mime },
    },
    asset: {
      fileId: projection.fileId,
      role: 'preview',
      displayName: projection.name,
      mimeType: mime,
      size: projection.size,
    },
  };
}
