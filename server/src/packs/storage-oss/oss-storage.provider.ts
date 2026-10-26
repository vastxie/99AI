import { BadRequestException } from '@nestjs/common';
import ALIOSS from 'ali-oss';
import { assertStorageRegion } from '@/modules/fileAsset/storage/object-storage.util';
import {
  DeleteObjectInput,
  GetObjectInput,
  GetObjectStreamResult,
  ObjectStatResult,
  PutObjectInput,
  PutObjectResult,
  SignedReadUrlInput,
  StorageProvider,
} from '@/modules/fileAsset/storage/storage-provider.interface';
import { sha256 } from '@/modules/fileAsset/storage/object-storage.util';
import { normalizeObjectKey } from '@/modules/fileAsset/storage/storage-path.util';

export interface OssPrivateStorageProviderOptions {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
}

const OSS_BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** OSS 桶名按规则校验、原样使用（只去首尾空白）：3 – 63 位小写字母、数字、短横线，首尾为字母或数字 */
export function assertOssBucketName(bucket: string): string {
  const value = String(bucket ?? '').trim();
  if (!OSS_BUCKET_PATTERN.test(value)) {
    throw new BadRequestException(
      '存储桶名不合法：OSS 桶名须为 3 – 63 位小写字母、数字或短横线，以字母或数字开头和结尾。',
    );
  }
  return value;
}

/** OSS 客户端绑定一个桶：按桶建客户端 */
export type OssClientFactory = (bucket: string) => any;

/** 阿里云 OSS：读、查、删、签名用记录里的桶（按桶建客户端并缓存），写入用当前配置的默认桶 */
export class OssPrivateStorageProvider implements StorageProvider {
  readonly name = 'oss' as const;

  /** 当前配置的默认桶：写入与不带记录桶的操作才用它，用到时才校验 */
  private readonly defaultBucket: string;
  private readonly createClient: OssClientFactory;
  private readonly clients = new Map<string, any>();

  constructor(options: OssPrivateStorageProviderOptions, createClient?: OssClientFactory) {
    this.defaultBucket = String(options.bucket || '').trim();
    const region = assertStorageRegion(options.region);
    this.createClient =
      createClient ||
      (bucket =>
        new (ALIOSS as any)({
          region,
          bucket,
          accessKeyId: options.accessKeyId,
          accessKeySecret: options.accessKeySecret,
          authorizationV4: true,
          secure: true,
        }));
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const { bucket, client } = this.target();
    const result = await client.put(objectKey, input.body, {
      headers: {
        'Content-Type': input.mime || 'application/octet-stream',
        ...(input.cacheControl ? { 'Cache-Control': input.cacheControl } : {}),
      },
    });
    return {
      bucket,
      objectKey,
      size: input.body.length,
      sha256: sha256(input.body),
      etag: result?.res?.headers?.etag?.replace(/^"|"$/g, ''),
    };
  }

  async getObjectStream(input: GetObjectInput): Promise<GetObjectStreamResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const result = await this.target(input.bucket).client.getStream(objectKey, {
      headers: input.range ? { Range: input.range } : undefined,
    });
    const headers = result?.res?.headers || {};
    return {
      stream: result.stream,
      size: Number(headers['content-length']) || undefined,
      mime: headers['content-type'],
      etag: headers.etag?.replace(/^"|"$/g, ''),
      lastModified: headers['last-modified'] ? new Date(headers['last-modified']) : undefined,
    };
  }

  async getObjectStat(input: GetObjectInput): Promise<ObjectStatResult> {
    try {
      const objectKey = normalizeObjectKey(input.objectKey);
      const result = await this.target(input.bucket).client.head(objectKey);
      const headers = result?.res?.headers || {};
      return {
        exists: true,
        size: Number(headers['content-length']) || undefined,
        mime: headers['content-type'],
        etag: headers.etag?.replace(/^"|"$/g, ''),
        lastModified: headers['last-modified'] ? new Date(headers['last-modified']) : undefined,
      };
    } catch (error: any) {
      if (error?.status === 404 || error?.code === 'NoSuchKey') return { exists: false };
      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const objectKey = normalizeObjectKey(input.objectKey);
    await this.target(input.bucket).client.delete(objectKey);
  }

  createSignedReadUrl(input: SignedReadUrlInput): Promise<string> {
    return Promise.resolve().then(() => {
      const objectKey = normalizeObjectKey(input.objectKey);
      const expires = Math.max(1, Math.min(Number(input.expiresInSeconds) || 600, 3600));
      return this.target(input.bucket).client.signatureUrl(objectKey, {
        expires,
        method: 'GET',
        response: {
          ...(input.responseContentType ? { 'content-type': input.responseContentType } : {}),
          ...(input.responseContentDisposition
            ? { 'content-disposition': input.responseContentDisposition }
            : {}),
        },
      });
    });
  }

  /** 记录里的桶优先，没有时用当前配置的默认桶；按 OSS 规则校验后取该桶的客户端 */
  private target(recordBucket?: string): { bucket: string; client: any } {
    const bucket = assertOssBucketName(recordBucket || this.defaultBucket);
    let client = this.clients.get(bucket);
    if (!client) {
      client = this.createClient(bucket);
      this.clients.set(bucket, client);
    }
    return { bucket, client };
  }
}
