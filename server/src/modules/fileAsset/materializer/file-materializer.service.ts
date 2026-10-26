import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import { readFile, stat } from 'fs/promises';
import { basename } from 'path';
import { Readable } from 'stream';
import { safeDownloadToBuffer, type SafeDownloadResult } from '@/common/utils/safe-download.util';
import { GLOBAL_CONFIG_SERVICE, GlobalConfigReader } from '../../globalConfig/globalConfig.tokens';
import { FileAssetService } from '../fileAsset.service';
import { FileAssetStorageService } from '../fileAsset-storage.service';
import { resolveFileSource, resolveLocalPublicFilePath } from './file-source-resolver';

export const MODEL_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 20_000;

export interface FileMaterializerActor {
  id?: number | string | null;
  role?: string | null;
  visitorId?: string | null;
}

export interface MaterializeImageForModelOptions {
  source: string;
  actor: FileMaterializerActor;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface MaterializedImageForModel {
  dataUrl: string;
  mime: string;
  size: number;
  sourceType: string;
}

export interface MaterializeFileForServiceOptions {
  source: string;
  actor: FileMaterializerActor;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface MaterializedFileForService {
  buffer: Buffer;
  name: string;
  mime: string;
  size: number;
  sourceType: string;
}

@Injectable()
export class FileMaterializerService {
  constructor(
    private readonly fileAssetService: FileAssetService,
    private readonly storageService: FileAssetStorageService,
    @Optional()
    @Inject(GLOBAL_CONFIG_SERVICE)
    private readonly globalConfigService?: GlobalConfigReader,
  ) {}

  async materializeImageForModel(
    options: MaterializeImageForModelOptions,
  ): Promise<MaterializedImageForModel> {
    const maxBytes = options.maxBytes || MODEL_IMAGE_MAX_BYTES;
    const resolverOptions = await this.getResolverOptions();
    const source = resolveFileSource(options.source, resolverOptions);

    if (source.kind === 'data_url') {
      const parsed = parseImageDataUrl(source.dataUrl || '', maxBytes);
      return toMaterializedImage(parsed.buffer, parsed.mime, source.kind);
    }

    if (source.kind === 'file_id' || source.kind === 'internal_file_url') {
      if (!source.fileId) {
        throw new BadRequestException('文件标识无效');
      }

      const file = await this.fileAssetService.findActiveForPreview(source.fileId, options.actor);
      const buffer = await this.readFileAssetToBuffer(file, maxBytes);
      return toMaterializedImage(buffer, file.mime, source.kind);
    }

    if (source.kind === 'public_file') {
      if (!source.pathname) {
        throw new BadRequestException('公开文件路径无效');
      }

      const localPath = resolveLocalPublicFilePath(
        source.pathname,
        resolverOptions.publicLocalBasePath,
      );
      const fileStat = await stat(localPath);
      if (fileStat.size > maxBytes) {
        throw new PayloadTooLargeException('图片文件过大');
      }

      const buffer = await readFile(localPath);
      return toMaterializedImage(buffer, undefined, source.kind);
    }

    if (source.kind === 'external_url') {
      const response = await safeDownloadToBuffer(source.source, {
        blockPrivateNetwork: true,
        maxBytes,
        timeoutMs: options.timeoutMs || DEFAULT_DOWNLOAD_TIMEOUT_MS,
      });
      return toMaterializedImage(response.buffer, response.contentType, source.kind);
    }

    throw new BadRequestException('不支持的文件来源');
  }

  async materializeFileForService(
    options: MaterializeFileForServiceOptions,
  ): Promise<MaterializedFileForService> {
    const maxBytes = options.maxBytes || MODEL_IMAGE_MAX_BYTES;
    const resolverOptions = await this.getResolverOptions();
    const source = resolveFileSource(options.source, resolverOptions);

    if (source.kind === 'data_url') {
      const parsed = parseBase64DataUrl(source.dataUrl || '', maxBytes);
      return {
        buffer: parsed.buffer,
        name: 'data-url-file',
        mime: parsed.mime,
        size: parsed.buffer.length,
        sourceType: source.kind,
      };
    }

    if (source.kind === 'file_id' || source.kind === 'internal_file_url') {
      if (!source.fileId) {
        throw new BadRequestException('文件标识无效');
      }

      const file = await this.fileAssetService.findActiveForDownload(source.fileId, options.actor);
      const buffer = await this.readFileAssetToBuffer(file, maxBytes);
      return {
        buffer,
        name: file.name || file.originalName || file.fileId,
        mime: file.mime || 'application/octet-stream',
        size: buffer.length,
        sourceType: source.kind,
      };
    }

    if (source.kind === 'public_file') {
      if (!source.pathname) {
        throw new BadRequestException('公开文件路径无效');
      }

      const localPath = resolveLocalPublicFilePath(
        source.pathname,
        resolverOptions.publicLocalBasePath,
      );
      const fileStat = await stat(localPath);
      if (fileStat.size > maxBytes) {
        throw new PayloadTooLargeException('文件过大');
      }

      const buffer = await readFile(localPath);
      return {
        buffer,
        name: basename(source.pathname),
        mime: 'application/octet-stream',
        size: buffer.length,
        sourceType: source.kind,
      };
    }

    if (source.kind === 'external_url') {
      const response = await safeDownloadToBuffer(source.source, {
        blockPrivateNetwork: true,
        maxBytes,
        timeoutMs: options.timeoutMs || DEFAULT_DOWNLOAD_TIMEOUT_MS,
      });
      return {
        buffer: response.buffer,
        name: basename(new URL(source.source).pathname) || 'download',
        mime: response.contentType || 'application/octet-stream',
        size: response.buffer.length,
        sourceType: source.kind,
      };
    }

    throw new BadRequestException('不支持的文件来源');
  }

  private async readFileAssetToBuffer(
    file: {
      bucket?: string | null;
      objectKey: string;
      storageProvider: string;
      storageScope?: 'public' | 'private';
      size: number;
      mime: string;
    },
    maxBytes: number,
  ): Promise<Buffer> {
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException('图片文件过大');
    }

    const scope = file.storageScope || 'private';
    const objectStat = await this.storageService.getObjectStat(
      scope,
      {
        bucket: file.bucket || undefined,
        objectKey: file.objectKey,
      },
      file.storageProvider,
    );
    if (!objectStat.exists) {
      throw new BadRequestException('文件内容不存在');
    }
    if (typeof objectStat.size === 'number' && objectStat.size > maxBytes) {
      throw new PayloadTooLargeException('图片文件过大');
    }

    const objectStream = await this.storageService.getObjectStream(
      scope,
      {
        bucket: file.bucket || undefined,
        objectKey: file.objectKey,
      },
      file.storageProvider,
    );

    return readStreamToBuffer(objectStream.stream, maxBytes);
  }

  private async getResolverOptions(): Promise<{ siteUrl?: string; publicLocalBasePath?: string }> {
    if (!this.globalConfigService) return {};
    const configs = await this.globalConfigService.getConfigs(['siteUrl', 'publicLocalBasePath']);
    if (!configs || typeof configs !== 'object') return {};
    return {
      siteUrl: String((configs as any).siteUrl || '').trim() || undefined,
      publicLocalBasePath: String((configs as any).publicLocalBasePath || '').trim() || undefined,
    };
  }
}

function parseImageDataUrl(
  dataUrl: string,
  maxBytes: number,
): {
  mime: string;
  buffer: Buffer;
} {
  const parsed = parseBase64DataUrl(dataUrl, maxBytes, '图片 data URL');
  const declaredMime = parsed.mime;
  if (!declaredMime.startsWith('image/')) {
    throw new BadRequestException('仅支持图片文件');
  }

  return parsed;
}

function parseBase64DataUrl(
  dataUrl: string,
  maxBytes: number,
  label = '文件 data URL',
): {
  mime: string;
  buffer: Buffer;
} {
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new BadRequestException(`${label}格式无效`);
  }

  const declaredMime = String(match[1] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!declaredMime || declaredMime === 'application/octet-stream') {
    throw new BadRequestException(`${label} MIME 无效`);
  }

  const base64 = match[2].replace(/\s/g, '');
  if (!isStrictBase64(base64)) {
    throw new BadRequestException(`${label}编码无效`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new BadRequestException('文件内容为空');
  }
  if (buffer.length > maxBytes) {
    throw new PayloadTooLargeException('文件过大');
  }

  const normalizedInput = base64.replace(/=+$/, '');
  const normalizedOutput = buffer.toString('base64').replace(/=+$/, '');
  if (normalizedInput !== normalizedOutput) {
    throw new BadRequestException(`${label}编码无效`);
  }

  return { mime: declaredMime, buffer };
}

function isStrictBase64(value: string): boolean {
  return Boolean(value) && value.length % 4 !== 1 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

async function readStreamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        stream.destroy();
        throw new PayloadTooLargeException('图片文件过大');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeException) {
      throw error;
    }
    throw new BadRequestException('读取文件内容失败');
  }

  return Buffer.concat(chunks);
}

function toMaterializedImage(
  buffer: Buffer,
  preferredMime: SafeDownloadResult['contentType'] | string | undefined,
  sourceType: string,
): MaterializedImageForModel {
  const detectedMime = detectImageMime(buffer);
  const mime = detectedMime || normalizeImageMime(preferredMime);

  if (!mime) {
    throw new BadRequestException('仅支持 PNG、JPEG、GIF、WEBP 图片');
  }

  return {
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    mime,
    size: buffer.length,
    sourceType,
  };
}

function normalizeImageMime(mime?: string | null): string | null {
  const normalized = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (
    normalized === 'image/png' ||
    normalized === 'image/jpeg' ||
    normalized === 'image/gif' ||
    normalized === 'image/webp'
  ) {
    return normalized;
  }

  return null;
}

function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (buffer.slice(0, 4).toString('ascii') === 'GIF8') {
      return 'image/gif';
    }
    if (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
  }

  return null;
}
