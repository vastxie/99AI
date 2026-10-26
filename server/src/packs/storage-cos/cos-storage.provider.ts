import { BadRequestException } from '@nestjs/common';
import COS from 'cos-nodejs-sdk-v5';
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
import { sha256, toReadable } from '@/modules/fileAsset/storage/object-storage.util';
import { normalizeObjectKey } from '@/modules/fileAsset/storage/storage-path.util';

export interface CosPrivateStorageProviderOptions {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
}

const COS_BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-\d+$/;
/** 腾讯云规则：完整请求域名 <BucketName-APPID>.cos.<地域>.myqcloud.com 不超过 60 个字符 */
const COS_HOST_MAX_LENGTH = 60;

/**
 * COS 桶名按规则校验、原样使用（只去首尾空白）：BucketName-APPID，名称为小写字母、数字、短横线且首尾不是短横线，
 * APPID 为数字，完整请求域名不超过 60 个字符
 */
export function assertCosBucketName(bucket: string, region: string): string {
  const value = String(bucket ?? '').trim();
  if (
    !COS_BUCKET_PATTERN.test(value) ||
    `${value}.cos.${region}.myqcloud.com`.length > COS_HOST_MAX_LENGTH
  ) {
    throw new BadRequestException(
      '存储桶名不合法：COS 桶名须为「名称-APPID」，名称只含小写字母、数字或短横线且不以短横线开头或结尾，APPID 为数字，完整访问域名不超过 60 个字符。',
    );
  }
  return value;
}

/** 腾讯云 COS：读、查、删、签名用记录里的桶，写入用当前配置的默认桶；地域始终用当前配置 */
export class CosPrivateStorageProvider implements StorageProvider {
  readonly name = 'cos' as const;

  /** 当前配置的默认桶：写入与不带记录桶的操作才用它，用到时才校验 */
  private readonly defaultBucket: string;
  private readonly region: string;
  private readonly client: any;

  constructor(options: CosPrivateStorageProviderOptions, client?: any) {
    this.defaultBucket = String(options.bucket || '').trim();
    this.region = assertStorageRegion(options.region);
    this.client =
      client ||
      new (COS as any)({
        SecretId: options.secretId,
        SecretKey: options.secretKey,
      });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const bucket = this.bucketFor();
    const result = await this.callCos('putObject', {
      Bucket: bucket,
      Region: this.region,
      Key: objectKey,
      Body: input.body,
      ContentType: input.mime || 'application/octet-stream',
      CacheControl: input.cacheControl,
    });
    return {
      bucket,
      objectKey,
      size: input.body.length,
      sha256: sha256(input.body),
      etag: result?.ETag?.replace(/^"|"$/g, ''),
    };
  }

  async getObjectStream(input: GetObjectInput): Promise<GetObjectStreamResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const result = await this.callCos('getObject', {
      Bucket: this.bucketFor(input.bucket),
      Region: this.region,
      Key: objectKey,
      Range: input.range,
    });
    const headers = result?.headers || {};
    return {
      stream: toReadable(result?.Body),
      size: Number(headers['content-length']) || undefined,
      mime: headers['content-type'],
      etag: result?.ETag?.replace(/^"|"$/g, '') || headers.etag?.replace(/^"|"$/g, ''),
      lastModified: headers['last-modified'] ? new Date(headers['last-modified']) : undefined,
    };
  }

  async getObjectStat(input: GetObjectInput): Promise<ObjectStatResult> {
    try {
      const objectKey = normalizeObjectKey(input.objectKey);
      const result = await this.callCos('headObject', {
        Bucket: this.bucketFor(input.bucket),
        Region: this.region,
        Key: objectKey,
      });
      const headers = result?.headers || {};
      return {
        exists: true,
        size: Number(headers['content-length']) || undefined,
        mime: headers['content-type'],
        etag: result?.ETag?.replace(/^"|"$/g, '') || headers.etag?.replace(/^"|"$/g, ''),
        lastModified: headers['last-modified'] ? new Date(headers['last-modified']) : undefined,
      };
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.code === 'NoSuchKey') return { exists: false };
      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const objectKey = normalizeObjectKey(input.objectKey);
    await this.callCos('deleteObject', {
      Bucket: this.bucketFor(input.bucket),
      Region: this.region,
      Key: objectKey,
    });
  }

  async createSignedReadUrl(input: SignedReadUrlInput): Promise<string> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const expires = Math.max(1, Math.min(Number(input.expiresInSeconds) || 600, 3600));
    // SDK 回调给的是 { Url }，不是字符串；直接返回对象会让下载重定向到 [object Object]
    const result = await this.callCos('getObjectUrl', {
      Bucket: this.bucketFor(input.bucket),
      Region: this.region,
      Key: objectKey,
      Sign: true,
      Expires: expires,
      Query: {
        ...(input.responseContentType
          ? { 'response-content-type': input.responseContentType }
          : {}),
        ...(input.responseContentDisposition
          ? { 'response-content-disposition': input.responseContentDisposition }
          : {}),
      },
    });
    if (typeof result?.Url !== 'string' || !result.Url) throw new Error('COS 未返回签名链接');
    return result.Url;
  }

  /** 记录里的桶优先，没有时用当前配置的默认桶；按 COS 规则（含完整域名长度）校验 */
  private bucketFor(recordBucket?: string): string {
    return assertCosBucketName(recordBucket || this.defaultBucket, this.region);
  }

  private callCos(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client[method](params, (err: any, data: any) => {
        if (err) return reject(err);
        return resolve(data);
      });
    });
  }
}
