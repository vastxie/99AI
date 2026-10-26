import { FileAssetEntity, FileAssetStatus, FileAssetVisibility } from './fileAsset.entity';

export interface FileAssetAccessActor {
  id?: number | string | null;
  role?: string | null;
  visitorId?: string | null;
}

export interface FileAssetFrontendProjection {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  category: string;
  purpose: string;
  visibility: string;
  previewUrl?: string;
  downloadUrl?: string;
  publicUrl?: string;
  role?: string;
  origin?: string;
}

export interface CreateFileAssetRecordInput {
  fileId: string;
  userId?: number | null;
  visitorId?: string | null;
  chatLogId?: number | null;
  messageId?: string | null;
  turnId?: string | null;
  origin?: string | null;
  storageScope: FileAssetEntity['storageScope'];
  storageProvider: FileAssetEntity['storageProvider'];
  bucket?: string | null;
  objectKey: string;
  originalName?: string | null;
  name: string;
  mime: string;
  ext?: string;
  size: number;
  sha256: string;
  category: FileAssetEntity['category'];
  purpose: FileAssetEntity['purpose'];
  visibility: FileAssetEntity['visibility'];
  status?: FileAssetEntity['status'];
  allowPreview?: boolean;
  allowDownload?: boolean;
  metadata?: Record<string, any> | null;
  expiresAt?: Date | null;
}

export interface CreateFileAssetFromBufferInput {
  buffer: Buffer;
  name: string;
  mime?: string;
  userId?: number | null;
  visitorId?: string | null;
  chatLogId?: number | null;
  messageId?: string | null;
  origin?: string | null;
  category?: FileAssetEntity['category'];
  purpose?: FileAssetEntity['purpose'];
  visibility?: FileAssetEntity['visibility'];
  allowPreview?: boolean;
  allowDownload?: boolean;
  metadata?: Record<string, any> | null;
  expiresAt?: Date | null;
  /** 仅宿主可设置；归属、回合、来源和内容共同决定幂等身份。 */
  delivery?: { turnId: string; sourceKey: string };
  signal?: AbortSignal;
}

export interface CreateAvatarFromUrlInput {
  url: string;
  userId?: number | null;
  provider?: string | null;
}

export interface ReadFileAssetsForRuntimeInput {
  fileIds: string[];
  userId?: number;
  visitorId?: string;
  maxFileSizeMb?: number;
  maxFiles?: number;
  allowedExtensions?: string[] | Set<string>;
}

export interface RuntimeInputFileAsset {
  sourceKind: 'file';
  sourceRef: string;
  name: string;
  originalName: string;
  mime: string;
  ext: string;
  size: number;
  buffer: Buffer;
  origin?: string | null;
}

export interface QueryAdminFileAssetInput {
  page?: number;
  size?: number;
  fileId?: string;
  keyword?: string;
  userId?: number | string;
  visibility?: string;
  status?: string;
  origin?: string;
}

export interface AdminFileAssetListItem {
  fileId: string;
  name: string;
  userId: number | null;
  visitorId: string | null;
  size: number;
  sha256?: string;
  visibility: FileAssetVisibility;
  status: FileAssetStatus;
  mime: string;
  ext: string;
  category: string;
  purpose: string;
  origin: string | null;
  allowPreview: boolean;
  allowDownload: boolean;
  contentAvailable: boolean;
  expiresAt: Date | null;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any> | null;
}
