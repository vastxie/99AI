import { BaseEntity } from '@/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

export type FileAssetStorageScope = 'public' | 'private';
/** 存储服务名：local 为内核自带，其余由存储包登记 */
export type FileAssetStorageProvider = string;
export type FileAssetCategory = 'media' | 'file' | 'avatar' | 'generated' | 'temp' | 'system';
export type FileAssetPurpose =
  | 'chat_image'
  | 'chat_video'
  | 'chat_audio'
  | 'chat_file'
  | 'avatar'
  | 'tool_output'
  | 'tool_media'
  | 'generated_image'
  | 'generated_file'
  | 'public_asset'
  | 'temp_upload';
export type FileAssetVisibility = 'private' | 'public' | 'temporary';
export type FileAssetStatus =
  'active' | 'deleted' | 'expired' | 'failed' | 'processing' | 'inactive';

@Entity({ name: 'file_assets' })
@Index('idx_file_asset_file_id', ['fileId'], { unique: true })
@Index('idx_file_asset_user_status_created', ['userId', 'status', 'createdAt'])
@Index('idx_file_asset_visitor_status_created', ['visitorId', 'status', 'createdAt'])
@Index('idx_file_asset_storage_status', ['storageScope', 'storageProvider', 'status'])
@Index('idx_file_asset_category_purpose_status', ['category', 'purpose', 'status'])
@Index('idx_file_asset_source_created', ['origin', 'createdAt'])
@Index('idx_file_asset_visibility_status', ['visibility', 'status'])
@Index('idx_file_asset_expires_status', ['expiresAt', 'status'])
@Index('idx_file_asset_sha256', ['sha256'])
@Index('idx_file_asset_user_turn', ['userId', 'turnId'])
@Index('idx_file_asset_visitor_turn', ['visitorId', 'turnId'])
export class FileAssetEntity extends BaseEntity {
  @Column({ length: 48, comment: '对外文件 ID' })
  fileId: string;

  @Column({ comment: '归属用户内部 ID', nullable: true })
  userId: number;

  @Column({ length: 64, nullable: true, comment: '访客归属 ID' })
  visitorId: string;

  @Column({ comment: '对话记录 ID', nullable: true })
  chatLogId: number;

  @Column({ length: 128, nullable: true, comment: '消息 ID 或任务上下文 ID' })
  messageId: string;

  @Column({ length: 96, nullable: true, comment: '宿主生成的 Agent 回合 ID' })
  turnId: string;

  @Column({ length: 96, nullable: true, comment: '来源标识' })
  origin: string;

  @Column({ type: 'varchar', length: 16, default: 'private', comment: '存储范围' })
  storageScope: FileAssetStorageScope;

  @Column({ type: 'varchar', length: 16, default: 'local', comment: '存储服务商' })
  storageProvider: FileAssetStorageProvider;

  @Column({ length: 128, nullable: true, select: false, comment: '对象存储 bucket' })
  bucket: string;

  @Column({ length: 1024, select: false, comment: '内部存储对象 key' })
  objectKey: string;

  @Column({ length: 255, nullable: true, comment: '用户原始文件名' })
  originalName: string;

  @Column({ length: 255, comment: '展示文件名' })
  name: string;

  @Column({ length: 128, default: 'application/octet-stream', comment: 'MIME 类型' })
  mime: string;

  @Column({ length: 24, default: '', comment: '文件扩展名' })
  ext: string;

  @Column({ type: 'bigint', default: 0, comment: '文件大小（字节）' })
  size: number;

  @Column({ length: 64, comment: 'SHA256 摘要' })
  sha256: string;

  @Column({ type: 'varchar', length: 24, default: 'file', comment: '文件分类' })
  category: FileAssetCategory;

  @Column({ type: 'varchar', length: 32, default: 'chat_file', comment: '文件用途' })
  purpose: FileAssetPurpose;

  @Column({ type: 'varchar', length: 16, default: 'private', comment: '可见性' })
  visibility: FileAssetVisibility;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: '文件状态' })
  status: FileAssetStatus;

  @Column({ default: true, comment: '是否允许预览' })
  allowPreview: boolean;

  @Column({ default: true, comment: '是否允许下载' })
  allowDownload: boolean;

  @Column({ length: 500, nullable: true, comment: '安全摘要' })
  summary: string;

  @Column({ type: 'json', nullable: true, comment: '安全元信息' })
  metadata: Record<string, any> | null;

  @Column({ type: 'datetime', nullable: true, comment: '过期时间' })
  expiresAt: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '最后访问时间' })
  lastAccessedAt: Date;
}
