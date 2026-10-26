import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import {
  DeleteObjectInput,
  GetObjectInput,
  GetObjectStreamResult,
  ObjectStatResult,
  PutObjectInput,
  PutObjectResult,
  SignedReadUrlInput,
  StorageProvider,
} from './storage-provider.interface';
import { encodeObjectKeyForUrl, normalizeObjectKey, resolveStoragePath } from './storage-path.util';

export interface LocalStorageProviderOptions {
  rootDir?: string;
  publicUrlPrefix?: string;
  scope: 'public' | 'private';
  minFreeBytes?: number;
  minFreeInodes?: number;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;
  private static writes: Promise<unknown> = Promise.resolve();
  private static queuedBytes = 0;
  private static queuedCount = 0;
  private readonly minFreeBytes: number;
  private readonly minFreeInodes: number;

  private readonly rootDir: string;
  private readonly publicUrlPrefix: string;
  private readonly scope: 'public' | 'private';

  constructor(options: LocalStorageProviderOptions) {
    this.scope = options.scope;
    this.minFreeBytes =
      options.minFreeBytes ?? readReserve('FILE_ASSET_LOCAL_MIN_FREE_MB', 1024, 16) * 1024 ** 2;
    this.minFreeInodes =
      options.minFreeInodes ?? readReserve('FILE_ASSET_LOCAL_MIN_FREE_INODES', 1000, 32);
    this.rootDir =
      options.rootDir ||
      (options.scope === 'public'
        ? path.join(process.cwd(), 'public', 'file')
        : path.join(process.cwd(), 'storage', 'private'));
    this.publicUrlPrefix = options.publicUrlPrefix || '/file';
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const filePath = resolveStoragePath(this.rootDir, objectKey);
    if (
      LocalStorageProvider.queuedCount >= 4 ||
      LocalStorageProvider.queuedBytes + input.body.length > 200 * 1024 ** 2
    )
      throw new ServiceUnavailableException('本地文件存储繁忙，请稍后重试。');
    LocalStorageProvider.queuedCount++;
    LocalStorageProvider.queuedBytes += input.body.length;
    const pendingPath = `${filePath}.pending`;
    const write = LocalStorageProvider.writes.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      try {
        const capacity = await fs.statfs(path.dirname(filePath), { bigint: true });
        if (
          capacity.bavail * capacity.bsize < BigInt(input.body.length + this.minFreeBytes) ||
          capacity.ffree < BigInt(this.minFreeInodes + 1)
        )
          throw new Error('capacity');
      } catch {
        throw new ServiceUnavailableException('本地文件存储空间不足或容量观测失败，请管理员检查。');
      }
      try {
        // The pending key is deterministic so the durable processing row also owns crash leftovers.
        await fs.rm(pendingPath, { force: true });
        const file = await fs.open(pendingPath, 'wx', 0o600);
        try {
          await file.writeFile(input.body);
          await file.chmod(this.scope === 'public' ? 0o444 : 0o600);
          await file.sync();
        } finally {
          await file.close();
        }
        await fs.rename(pendingPath, filePath);
      } catch (error) {
        await fs.rm(pendingPath, { force: true }).catch((): undefined => undefined);
        throw error;
      }
    });
    LocalStorageProvider.writes = write.catch((): undefined => undefined);
    try {
      await write;
    } finally {
      LocalStorageProvider.queuedCount--;
      LocalStorageProvider.queuedBytes -= input.body.length;
    }

    return {
      objectKey,
      size: input.body.length,
      sha256: createHash('sha256').update(input.body).digest('hex'),
    };
  }

  async getObjectStream(input: GetObjectInput): Promise<GetObjectStreamResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const filePath = resolveStoragePath(this.rootDir, objectKey);
    const stat = await fs.stat(filePath);
    const range = parseByteRange(input.range, stat.size);
    return {
      stream: createReadStream(
        filePath,
        range ? { start: range.start, end: range.end } : undefined,
      ),
      size: range ? range.end - range.start + 1 : stat.size,
      mime: mime.lookup(objectKey) || 'application/octet-stream',
      lastModified: stat.mtime,
    };
  }

  async getObjectStat(input: GetObjectInput): Promise<ObjectStatResult> {
    try {
      const objectKey = normalizeObjectKey(input.objectKey);
      const filePath = resolveStoragePath(this.rootDir, objectKey);
      const stat = await fs.stat(filePath);
      return {
        exists: true,
        size: stat.size,
        mime: mime.lookup(objectKey) || 'application/octet-stream',
        lastModified: stat.mtime,
      };
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return { exists: false };
      }
      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const filePath = resolveStoragePath(this.rootDir, objectKey);
    await fs.rm(`${filePath}.pending`, { force: true });
    await fs.rm(filePath, { force: true });
  }

  createSignedReadUrl(input: SignedReadUrlInput): Promise<string> {
    return Promise.resolve().then(() => {
      if (this.scope !== 'public') {
        throw new Error('local private storage 不生成 signed URL');
      }
      return `${this.publicUrlPrefix.replace(/\/+$/, '')}/${encodeObjectKeyForUrl(input.objectKey)}`;
    });
  }
}

export class LocalPublicStorageProvider extends LocalStorageProvider {
  constructor(options: Omit<LocalStorageProviderOptions, 'scope'> = {}) {
    super({ ...options, scope: 'public' });
  }
}

export class LocalPrivateStorageProvider extends LocalStorageProvider {
  constructor(options: Omit<LocalStorageProviderOptions, 'scope'> = {}) {
    super({ ...options, scope: 'private' });
  }
}

function parseByteRange(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(size - suffixLength, 0);
    return { start, end: size - 1 };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function readReserve(key: string, fallback: number, minimum: number): number {
  const raw = process.env[key];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > 1024 ** 3)
    throw new Error('本地文件存储安全水位配置无效');
  return value;
}
