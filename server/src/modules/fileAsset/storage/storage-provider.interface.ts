import { Readable } from 'stream';

/** 存储服务名：内核自带 local，其余由各存储包登记 */
export type FileAssetStorageProviderName = string;
export type StorageProviderScope = 'public' | 'private';

/** 读取站点配置的最小接口（与 GlobalConfigReader 同形） */
export interface StorageConfigReader {
  getConfigs(configKey: string[]): Promise<any>;
}

export interface PutObjectInput {
  objectKey: string;
  body: Buffer;
  mime?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  bucket?: string;
  objectKey: string;
  size: number;
  sha256: string;
  etag?: string;
}

export interface GetObjectInput {
  bucket?: string;
  objectKey: string;
  range?: string;
}

export interface GetObjectStreamResult {
  stream: Readable;
  size?: number;
  mime?: string;
  etag?: string;
  lastModified?: Date;
}

export interface ObjectStatResult {
  exists: boolean;
  size?: number;
  mime?: string;
  etag?: string;
  lastModified?: Date;
}

export interface DeleteObjectInput {
  bucket?: string;
  objectKey: string;
}

export interface SignedReadUrlInput {
  bucket?: string;
  objectKey: string;
  expiresInSeconds: number;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export interface StorageProvider {
  readonly name: FileAssetStorageProviderName;

  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObjectStream(input: GetObjectInput): Promise<GetObjectStreamResult>;
  getObjectStat(input: GetObjectInput): Promise<ObjectStatResult>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  createSignedReadUrl(input: SignedReadUrlInput): Promise<string>;
}

/**
 * 对象存储厂商工厂：各存储包在构造时向 StorageProviderRegistry 登记，
 * 内核按站点配置里选定的名字取工厂、按作用域（public / private）创建实例。
 */
export interface StorageProviderFactory {
  readonly name: string;
  /** 管理端下拉展示名 */
  readonly label: string;
  create(scope: StorageProviderScope, configs: StorageConfigReader): Promise<StorageProvider>;
}
