import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
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

const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IPV4_LIKE_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * S3 桶名按规则校验、原样使用（只去首尾空白，以前删掉点号会悄悄换成另一个桶）：3 – 63 位小写字母、数字、点、
 * 短横线，首尾为字母或数字，不含连续点号、不形如 IPv4，不以 xn-- 开头、不以 -s3alias 结尾
 */
export function assertS3BucketName(bucket: string): string {
  const value = String(bucket ?? '').trim();
  if (
    !S3_BUCKET_PATTERN.test(value) ||
    value.includes('..') ||
    IPV4_LIKE_PATTERN.test(value) ||
    value.startsWith('xn--') ||
    value.endsWith('-s3alias')
  ) {
    throw new BadRequestException(
      '存储桶名不合法：S3 桶名须为 3 – 63 位小写字母、数字、点或短横线，以字母或数字开头和结尾，不能有连续的点，也不能形如 IP 地址。',
    );
  }
  return value;
}

/** 严格的 RFC 3986 编码（再编码 !'()*），与 S3 SDK 对对象键和查询参数的编码一致 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hashHex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function formatAmzDate(date: Date): { dateStamp: string; amzDate: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    dateStamp: iso.slice(0, 8),
    amzDate: iso,
  };
}

export interface S3PresignInput {
  /** 对象地址：host 与已编码的路径（签名的规范 URI 原样取 pathname） */
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
  expiresInSeconds: number;
  /** 额外的查询参数（如 response-content-disposition） */
  query?: Record<string, string>;
}

/** SigV4 预签名 GET 地址：只签 host，负载为 UNSIGNED-PAYLOAD。时间与有效期由调用方给定，便于对照官方示例 */
export function presignS3GetUrl(input: S3PresignInput): string {
  const { dateStamp, amzDate } = formatAmzDate(input.date);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
    ...input.query,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map(key => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    input.url.pathname,
    canonicalQuery,
    `host:${input.url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  const url = new URL(input.url.toString());
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

export interface S3PrivateStorageProviderOptions {
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
}

/** S3 及兼容对象存储（MinIO、Cloudflare R2 等）；签名链接按 SigV4 自行计算 */
export class S3PrivateStorageProvider implements StorageProvider {
  readonly name = 's3' as const;

  private readonly client: S3Client;
  private readonly region: string;
  /** 当前配置的默认桶：写入与不带记录桶的操作才用它，用到时才校验 */
  private readonly defaultBucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly endpoint?: string;

  constructor(options: S3PrivateStorageProviderOptions, client?: S3Client) {
    this.region = assertStorageRegion(String(options.region || '').trim() || 'us-east-1');
    this.defaultBucket = String(options.bucket || '').trim();
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.endpoint = options.endpoint;
    this.client =
      client ||
      new S3Client({
        region: this.region,
        endpoint: this.endpoint,
        forcePathStyle: !!this.endpoint,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const bucket = this.bucketFor();
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.mime || 'application/octet-stream',
        CacheControl: input.cacheControl,
        Metadata: input.metadata,
      }),
    );

    return {
      bucket,
      objectKey,
      size: input.body.length,
      sha256: sha256(input.body),
      etag: result.ETag?.replace(/^"|"$/g, ''),
    };
  }

  async getObjectStream(input: GetObjectInput): Promise<GetObjectStreamResult> {
    const objectKey = normalizeObjectKey(input.objectKey);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketFor(input.bucket),
        Key: objectKey,
        Range: input.range,
      }),
    );

    return {
      stream: toReadable(result.Body),
      size: result.ContentLength,
      mime: result.ContentType,
      etag: result.ETag?.replace(/^"|"$/g, ''),
      lastModified: result.LastModified,
    };
  }

  async getObjectStat(input: GetObjectInput): Promise<ObjectStatResult> {
    try {
      const objectKey = normalizeObjectKey(input.objectKey);
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketFor(input.bucket),
          Key: objectKey,
        }),
      );
      return {
        exists: true,
        size: result.ContentLength,
        mime: result.ContentType,
        etag: result.ETag?.replace(/^"|"$/g, ''),
        lastModified: result.LastModified,
      };
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
        return { exists: false };
      }
      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const objectKey = normalizeObjectKey(input.objectKey);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketFor(input.bucket),
        Key: objectKey,
      }),
    );
  }

  createSignedReadUrl(input: SignedReadUrlInput): Promise<string> {
    return Promise.resolve().then(() => {
      const objectKey = normalizeObjectKey(input.objectKey);
      const expiresInSeconds = Math.max(1, Math.min(Number(input.expiresInSeconds) || 600, 3600));
      const query: Record<string, string> = {};
      if (input.responseContentType) {
        query['response-content-type'] = input.responseContentType;
      }
      if (input.responseContentDisposition) {
        query['response-content-disposition'] = input.responseContentDisposition;
      }
      return presignS3GetUrl({
        url: this.buildObjectUrl(this.bucketFor(input.bucket), objectKey),
        region: this.region,
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        date: new Date(),
        expiresInSeconds,
        query,
      });
    });
  }

  /** 记录里的桶优先，没有时用当前配置的默认桶；都按 S3 规则校验 */
  private bucketFor(recordBucket?: string): string {
    return assertS3BucketName(recordBucket || this.defaultBucket);
  }

  /**
   * 与 S3 SDK 的寻址一致：自定义 endpoint 用路径式（保留路径前缀）；默认端点用按地域的虚拟主机，
   * 桶名含点号时改用路径式（虚拟主机在 HTTPS 下证书不匹配）。对象键逐段严格编码
   */
  private buildObjectUrl(bucket: string, objectKey: string): URL {
    const encodedKey = objectKey.split('/').map(encodeRfc3986).join('/');
    if (this.endpoint) {
      const endpoint = new URL(this.endpoint);
      const prefix = endpoint.pathname.replace(/\/+$/, '');
      endpoint.pathname = `${prefix}/${bucket}/${encodedKey}`;
      endpoint.search = '';
      endpoint.hash = '';
      return endpoint;
    }
    if (bucket.includes('.')) {
      return new URL(`https://s3.${this.region}.amazonaws.com/${bucket}/${encodedKey}`);
    }
    return new URL(`https://${bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`);
  }
}
