import { safeDownloadToBuffer, SafeDownloadOptions } from './safe-download.util';

/**
 * 将远程 URL 资源转换为 base64 编码
 * 支持图片、音频、视频等任意多媒体文件
 * @param fileUrl 远程资源 URL
 * @param timeout 超时时间（毫秒），默认 30s
 * @returns { base64: string, mimeType: string, dataUri: string }
 */
export async function urlToBase64(
  fileUrl: string,
  timeout = 30000,
  options: Pick<SafeDownloadOptions, 'lookup'> = {},
): Promise<{ base64: string; mimeType: string; dataUri: string }> {
  const response = await safeDownloadToBuffer(fileUrl, {
    blockPrivateNetwork: true,
    timeoutMs: timeout,
    lookup: options.lookup,
  });

  const mimeType = response.contentType || 'application/octet-stream';
  const base64 = response.buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  return { base64, mimeType, dataUri };
}

/**
 * 从 MIME 类型推断文件格式（用于 input_audio.format 等字段）
 * @param mimeType MIME 类型
 * @returns 格式字符串，如 'wav', 'mp3', 'png'
 */
export function mimeTypeToFormat(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return map[mimeType] || mimeType.split('/')[1] || 'unknown';
}
