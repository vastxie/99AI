import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { extname } from 'path';
import { DeepPartial, Repository, SelectQueryBuilder } from 'typeorm';
import { createFileId, createStorageId } from '@/common/utils';
import { getErrorStack } from '@/common/utils/error-stack.util';
import { safeDownloadToBuffer } from '@/common/utils/safe-download.util';
import { GLOBAL_CONFIG_SERVICE, GlobalConfigReader } from '../globalConfig/globalConfig.tokens';
import { UserEntity } from '../user/user.entity';
import { FileAssetEntity } from './fileAsset.entity';
import { FileAssetStorageService } from './fileAsset-storage.service';
import type { StorageProvider } from './storage/storage-provider.interface';
import { FileAssetStatus, FileAssetVisibility } from './fileAsset.entity';
import {
  AdminFileAssetListItem,
  CreateAvatarFromUrlInput,
  CreateFileAssetFromBufferInput,
  CreateFileAssetRecordInput,
  FileAssetAccessActor,
  FileAssetFrontendProjection,
  QueryAdminFileAssetInput,
  ReadFileAssetsForRuntimeInput,
  RuntimeInputFileAsset,
} from './fileAsset.types';
import {
  buildPrivateObjectKey,
  buildPublicAvatarObjectKey,
  detectAvatarImageType,
  hashStorageSegment,
  isDuplicateKeyError,
  isFileAssetStatus,
  isFileAssetVisibility,
  isRuntimePreviewable,
  normalizeAdminFileIds,
  normalizeAllowedExtensions,
  normalizeClearFilters,
  normalizeFileExtension,
  normalizeNullableNumber,
  normalizePage,
  normalizePageSize,
  readStreamToBufferLimited,
  sanitizeFileAssetMetadata,
  sanitizeMetadataText,
  sanitizeRuntimeFileName,
  sanitizeStoragePathSegment,
  stableFallbackStorageId,
  uniqueRuntimeFileIds,
} from './fileAsset.util';
import { FILE_ID_PATTERN } from '@/common/constants/id-pattern.constant';

export * from './fileAsset.types';

const FILE_ID_CREATE_RETRY_LIMIT = 8;
const DEFAULT_FILE_ASSET_PRIVATE_RETENTION_DAYS = 30;
const DEFAULT_FILE_ASSET_TEMPORARY_RETENTION_HOURS = 24;
const DEFAULT_FILE_ASSET_CLEANUP_BATCH_SIZE = 50;
// 私有文件默认配额（MB）：注册用户默认不限（后台 fileAssetUserQuotaMb 可设），访客默认 200 MB（fileAssetVisitorQuotaMb），0 表示不限
const DEFAULT_FILE_ASSET_USER_QUOTA_MB = 1024;
const DEFAULT_FILE_ASSET_VISITOR_QUOTA_MB = 200;
const DEFAULT_RUNTIME_FILE_LIMIT_MB = 50;
const DEFAULT_RUNTIME_MAX_FILES = 10;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** 公开头像不计配额、不过期：每个用户只保留最近几张上传，正在使用的不删 */
export const AVATAR_UPLOADS_KEPT = 5;
const AVATAR_PRUNE_BATCH = 100;
const FILE_ASSET_PROCESSING_STALE_MS = 15 * 60 * 1000;

/**
 * 各存储实现对「对象不存在」的报错形状。清理链路把它归一化为已删除，
 * 否则崩溃在 putObject 之前的 processing 行会被每轮清扫永久重试。
 */
function isMissingStoredObjectError(error: any): boolean {
  const code = String(error?.code || error?.name || '');
  const status = Number(
    error?.status ?? error?.statusCode ?? error?.$metadata?.httpStatusCode ?? NaN,
  );
  return status === 404 || ['ENOENT', 'NoSuchKey', 'NotFound'].includes(code);
}

/** 文件资产写入值：userId 等为可空列，实体属性未标 | null（联合类型会破坏 TypeORM 列元数据），写 null 时用本类型描述 */
type FileAssetWriteValues = Omit<
  Partial<FileAssetEntity>,
  'userId' | 'visitorId' | 'chatLogId' | 'messageId' | 'turnId' | 'origin' | 'bucket'
> & {
  userId?: number | null;
  visitorId?: string | null;
  chatLogId?: number | null;
  messageId?: string | null;
  turnId?: string | null;
  origin?: string | null;
  bucket?: string | null;
};

@Injectable()
export class FileAssetService {
  private quotaLockHeld = false;
  private queuedWrites = 0;
  private queuedWriteBytes = 0;
  private readonly outputWrites = new Map<string, Promise<void>>();
  constructor(
    @InjectRepository(FileAssetEntity)
    private readonly fileAssetRepository: Repository<FileAssetEntity>,
    private readonly fileAssetStorageService?: FileAssetStorageService,
    @Optional()
    @InjectRepository(UserEntity)
    private readonly userRepository?: Repository<UserEntity>,
    @Optional()
    @Inject(GLOBAL_CONFIG_SERVICE)
    private readonly globalConfigService?: GlobalConfigReader,
  ) {}

  async createUniqueFileId(): Promise<string> {
    for (let attempt = 0; attempt < FILE_ID_CREATE_RETRY_LIMIT; attempt += 1) {
      const fileId = createFileId();
      const existing = await this.fileAssetRepository.findOne({
        where: { fileId },
        select: { id: true },
      });
      if (!existing) return fileId;
    }

    throw new Error('FileAsset fileId generation failed');
  }

  async findActiveForPreview(
    fileId: string,
    actor: FileAssetAccessActor,
  ): Promise<FileAssetEntity> {
    const file = await this.findByFileIdForAccess(fileId);
    this.assertPreviewAllowed(file, actor);
    return file;
  }

  async findActiveForDownload(
    fileId: string,
    actor: FileAssetAccessActor,
  ): Promise<FileAssetEntity> {
    const file = await this.findByFileIdForAccess(fileId);
    this.assertDownloadAllowed(file, actor);
    return file;
  }

  async findActivePublicForPreview(fileId: string): Promise<FileAssetEntity> {
    const file = await this.findByFileIdForAccess(fileId);
    this.assertPublicAccessible(file);
    if (!file.allowPreview) {
      throw new ForbiddenException('该文件不允许预览。');
    }
    return file;
  }

  async findActivePublicForDownload(fileId: string): Promise<FileAssetEntity> {
    const file = await this.findByFileIdForAccess(fileId);
    this.assertPublicAccessible(file);
    if (!file.allowDownload) {
      throw new ForbiddenException('该文件不允许下载。');
    }
    return file;
  }

  async findByFileId(fileId: string): Promise<FileAssetEntity> {
    const file = await this.fileAssetRepository.findOne({ where: { fileId } });
    if (!file) {
      throw new NotFoundException('文件不存在或已失效。');
    }
    return file;
  }

  async findByFileIdForAccess(fileId: string): Promise<FileAssetEntity> {
    const file = await this.fileAssetRepository
      .createQueryBuilder('file')
      .addSelect(['file.bucket', 'file.objectKey'])
      .where('file.fileId = :fileId', { fileId })
      .getOne();

    if (!file) {
      throw new NotFoundException('文件不存在或已失效。');
    }
    return file;
  }

  async markAccessed(fileId: string): Promise<void> {
    await this.fileAssetRepository.update({ fileId }, { lastAccessedAt: new Date() });
  }

  async createRecord(input: CreateFileAssetRecordInput): Promise<FileAssetEntity> {
    const expiresAt = Object.prototype.hasOwnProperty.call(input, 'expiresAt')
      ? input.expiresAt || null
      : await this.resolveDefaultExpiresAt(input.visibility);
    const values: FileAssetWriteValues = {
      fileId: input.fileId,
      userId: input.userId ?? null,
      visitorId: input.visitorId ?? null,
      chatLogId: input.chatLogId ?? null,
      messageId: input.messageId || null,
      turnId: input.turnId || null,
      origin: input.origin || null,
      storageScope: input.storageScope,
      storageProvider: input.storageProvider,
      bucket: input.bucket || null,
      objectKey: input.objectKey,
      originalName: input.originalName || input.name,
      name: input.name,
      mime: input.mime || 'application/octet-stream',
      ext: input.ext || '',
      size: input.size,
      sha256: input.sha256,
      category: input.category,
      purpose: input.purpose,
      visibility: input.visibility,
      status: input.status || 'active',
      allowPreview: input.allowPreview ?? true,
      allowDownload: input.allowDownload ?? true,
      metadata: input.metadata || null,
      expiresAt,
    };
    // 可空列写 null：实体属性未标 | null，在仓库边界收口
    const entity = this.fileAssetRepository.create(values as DeepPartial<FileAssetEntity>);
    return await this.fileAssetRepository.save(entity);
  }

  /**
   * 对象已经写入之后建档：建档报错不等于没写进去，先按 fileId 复查——查到（实际已提交）不删；查不到才用写入时的
   * 同一个存储实例删除刚写的对象；复查也失败（结果未知）不删。删除失败只记日志；都照常抛出原错误。
   * 只能补偿捕获到的失败，进程在写入与建档之间退出留下的对象不在此列
   */
  async createRecordOrDiscardObject(
    provider: StorageProvider,
    input: CreateFileAssetRecordInput,
  ): Promise<FileAssetEntity> {
    try {
      return await this.createRecord(input);
    } catch (error) {
      await this.discardObjectIfUnrecorded(provider, input);
      throw error;
    }
  }

  private async discardObjectIfUnrecorded(
    provider: StorageProvider,
    input: Pick<CreateFileAssetRecordInput, 'fileId' | 'bucket' | 'objectKey'>,
  ) {
    let recorded: boolean;
    try {
      recorded = !!(await this.fileAssetRepository.findOne({
        where: { fileId: input.fileId },
        select: { id: true },
        withDeleted: true,
      }));
    } catch (error) {
      Logger.error(
        '建档报错后复查文件记录失败，保留已写入的对象',
        getErrorStack(error),
        'FileAssetService',
      );
      return;
    }
    if (recorded) return;
    try {
      await provider.deleteObject({
        bucket: input.bucket || undefined,
        objectKey: input.objectKey,
      });
    } catch (error) {
      Logger.error('删除未建档的对象失败，需要人工清理', getErrorStack(error), 'FileAssetService');
    }
  }

  async createFromBuffer(
    input: CreateFileAssetFromBufferInput,
  ): Promise<FileAssetFrontendProjection> {
    if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
      throw new BadRequestException('文件内容不能为空。');
    }
    return this.withPrivateWriteLock(input, writer => writer.createBufferInLock(input));
  }

  /** 每进程有界串行写入，数据库命名锁跨进程覆盖额度预留到最终状态。 */
  private async withPrivateWriteLock<T>(
    input: { userId?: number | null; visitorId?: string | null; buffer?: Buffer },
    operation: (writer: FileAssetService) => Promise<T>,
  ): Promise<T> {
    if (this.quotaLockHeld) return operation(this);
    const bytes = input.buffer?.length || 0;
    if (
      bytes > 100 * 1024 ** 2 ||
      this.queuedWriteBytes + bytes > 200 * 1024 ** 2 ||
      this.queuedWrites >= 4
    )
      throw new BadRequestException('文件保存繁忙，请稍后重试。');
    this.queuedWrites++;
    this.queuedWriteBytes += bytes;
    try {
      return await this.withOutputLock('private-writes', async () => {
        const runner = this.fileAssetRepository.manager.dataSource.createQueryRunner();
        const key =
          'file-quota:' +
          createHash('sha256')
            .update(
              JSON.stringify([
                normalizeNullableNumber(input.userId),
                input.userId ? null : input.visitorId || null,
              ]),
            )
            .digest('hex')
            .slice(0, 48);
        let locked = false;
        try {
          await runner.connect();
          const rows = await runner.query('SELECT GET_LOCK(?, 10) AS acquired', [key]);
          if (Number(rows?.[0]?.acquired) !== 1)
            throw new BadRequestException('文件额度锁不可用，请重试。');
          locked = true;
          // 命名锁与写入使用同一数据库连接；连接丢失后不能越过失效的锁继续预留额度。
          const writer = new FileAssetService(
            runner.manager.getRepository(FileAssetEntity),
            this.fileAssetStorageService,
            this.userRepository,
            this.globalConfigService,
          );
          writer.quotaLockHeld = true;
          return await operation(writer);
        } finally {
          try {
            if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [key]);
          } finally {
            await runner.release();
          }
        }
      });
    } finally {
      this.queuedWrites--;
      this.queuedWriteBytes -= bytes;
    }
  }

  private async createBufferInLock(
    input: CreateFileAssetFromBufferInput,
  ): Promise<FileAssetFrontendProjection> {
    if (!input.delivery) return this.writeBufferAsset(input);
    const { turnId, sourceKey } = input.delivery;
    if (
      !/^[A-Za-z0-9_-]{1,96}$/.test(turnId) ||
      !sourceKey ||
      sourceKey.length > 2048 ||
      !input.messageId ||
      (!normalizeNullableNumber(input.userId) && !input.visitorId)
    ) {
      throw new BadRequestException('文件交付缺少有效的宿主回合与归属。');
    }
    const identity = JSON.stringify([
      input.userId || null,
      input.visitorId || null,
      input.messageId,
      turnId,
      sourceKey,
      input.purpose,
      input.name,
      input.mime,
      createHash('sha256').update(input.buffer).digest('hex'),
    ]);
    const fileId = `file_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
    return this.withOutputLock(this.outputScope(input.userId, input.visitorId, turnId), () =>
      this.writeBufferAsset(input, fileId),
    );
  }

  /** 宿主专用的本轮累计产物清单；恢复不依赖沙箱目录或进程内工具结果。 */
  async listTurnOutputs(input: {
    userId?: number;
    visitorId?: string;
    messageId: string;
    turnId: string;
  }): Promise<FileAssetFrontendProjection[]> {
    const userId = normalizeNullableNumber(input.userId);
    if (
      (!userId && !input.visitorId) ||
      !input.messageId ||
      !/^[A-Za-z0-9_-]{1,96}$/.test(input.turnId)
    ) {
      throw new BadRequestException('文件交付缺少有效的宿主回合与归属。');
    }
    const rows = await this.fileAssetRepository
      .createQueryBuilder('file')
      .where('file.turnId = :turnId', { turnId: input.turnId })
      .andWhere('file.messageId = :messageId', { messageId: input.messageId })
      .andWhere(
        userId ? 'file.userId = :userId' : 'file.visitorId = :visitorId',
        userId ? { userId } : { visitorId: input.visitorId },
      )
      .andWhere(userId ? 'file.visitorId IS NULL' : 'file.userId IS NULL')
      .andWhere('file.purpose = :purpose', { purpose: 'tool_output' })
      .andWhere('file.status = :status', { status: 'active' })
      .andWhere('(file.expiresAt IS NULL OR file.expiresAt > :now)', { now: new Date() })
      .orderBy('file.createdAt', 'ASC')
      .addOrderBy('file.fileId', 'ASC')
      .getMany();
    return rows.map(file => this.toFrontendFileAsset(file));
  }

  private outputScope(
    userId: number | null | undefined,
    visitorId: string | null | undefined,
    turnId: string,
  ): string {
    return JSON.stringify([userId || null, visitorId || null, turnId]);
  }

  private async withOutputLock<T>(scope: string, operation: () => Promise<T>): Promise<T> {
    const task = (this.outputWrites.get(scope) || Promise.resolve()).then(operation);
    const settled = task.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    this.outputWrites.set(scope, settled);
    try {
      return await task;
    } finally {
      if (this.outputWrites.get(scope) === settled) this.outputWrites.delete(scope);
    }
  }

  private async writeBufferAsset(
    input: CreateFileAssetFromBufferInput,
    deliveryFileId?: string,
  ): Promise<FileAssetFrontendProjection> {
    if (input.signal?.aborted) throw new Error('文件交付已取消');
    const storage = this.requireStorageService();
    const safeName = sanitizeRuntimeFileName(input.name);
    const ext = normalizeFileExtension(extname(safeName));
    const mime = input.mime || 'application/octet-stream';
    const fileId = deliveryFileId || (await this.createUniqueFileId());
    const existing = deliveryFileId ? await this.findByFileIdForStorage(fileId) : null;
    const storageProvider = await storage.resolveProviderName('private');
    const userId = normalizeNullableNumber(input.userId);
    const visitorId = input.visitorId || null;
    const visibility = input.visibility || 'private';
    if (existing) {
      if (
        existing.userId !== userId ||
        existing.visitorId !== visitorId ||
        existing.messageId !== input.messageId ||
        existing.turnId !== input.delivery?.turnId ||
        existing.sha256 !== createHash('sha256').update(input.buffer).digest('hex') ||
        existing.visibility !== visibility ||
        existing.purpose !== input.purpose
      ) {
        throw new BadRequestException('文件交付身份冲突。');
      }
      if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now())
        throw new GoneException('文件已过期。');
      if (existing.status === 'active') return this.toFrontendFileAsset(existing);
      const retryable =
        (['failed', 'deleted'].includes(existing.status) &&
          existing.metadata?.fileContentCleanupTarget === 'create_failed') ||
        (existing.status === 'processing' &&
          existing.updatedAt?.getTime() <= Date.now() - FILE_ASSET_PROCESSING_STALE_MS &&
          ['object_write_pending', 'cleanup_pending'].includes(
            String(existing.metadata?.fileContentLifecycle),
          ) &&
          (!existing.metadata?.fileContentCleanupTarget ||
            existing.metadata.fileContentCleanupTarget === 'create_failed'));
      if (!retryable) throw new GoneException('文件已失效，不能重新发布。');
    }
    if (input.delivery) {
      const rows = await this.fileAssetRepository
        .createQueryBuilder('file')
        .where('file.turnId = :turnId', { turnId: input.delivery.turnId })
        .andWhere('(file.origin IS NULL OR file.origin <> :controlOrigin)', {
          controlOrigin: 'sandbox_turn',
        })
        .andWhere(
          userId ? 'file.userId = :userId' : 'file.visitorId = :visitorId',
          userId ? { userId } : { visitorId },
        )
        .getMany();
      const others = rows.filter(file => file.fileId !== fileId);
      if (
        others.length >= 20 ||
        others.reduce((total, file) => total + Number(file.size), 0) + input.buffer.length >
          200 * 1024 * 1024
      ) {
        throw new BadRequestException('本轮文件交付超过累计上限（20 个或 200 MB）。');
      }
    }
    if (visibility !== 'public') {
      await this.assertActorQuotaAvailable(
        { userId, visitorId },
        input.buffer.length,
        existing?.fileId,
      );
    }
    const privatePartition = await this.resolvePrivateObjectPartition({ userId, visitorId });
    const objectKey =
      existing?.objectKey || buildPrivateObjectKey(privatePartition, 'tools', fileId, ext);
    const expectedSha256 = createHash('sha256').update(input.buffer).digest('hex');
    const baseMetadata = sanitizeFileAssetMetadata(input.metadata);
    const recordInput: CreateFileAssetRecordInput = {
      fileId,
      userId,
      visitorId,
      chatLogId: normalizeNullableNumber(input.chatLogId),
      messageId: input.messageId || null,
      turnId: input.delivery?.turnId || null,
      origin: input.origin || null,
      storageScope: 'private',
      storageProvider,
      bucket: null,
      objectKey,
      originalName: safeName,
      name: safeName,
      mime,
      ext,
      size: input.buffer.length,
      sha256: expectedSha256,
      category: input.category || 'generated',
      purpose: input.purpose || 'tool_output',
      visibility,
      status: 'processing',
      allowPreview: input.allowPreview ?? isRuntimePreviewable(mime, ext),
      allowDownload: input.allowDownload ?? true,
      metadata: {
        ...(baseMetadata || {}),
        fileContentLifecycle: 'object_write_pending',
      },
      ...(Object.prototype.hasOwnProperty.call(input, 'expiresAt')
        ? { expiresAt: input.expiresAt || null }
        : {}),
    };
    let record = existing
      ? await this.fileAssetRepository.save(
          Object.assign(existing, recordInput, { storageProvider: existing.storageProvider }),
        )
      : await this.createRecord(recordInput);
    try {
      const stored = await storage.putObject(
        'private',
        {
          objectKey,
          body: input.buffer,
          mime,
          cacheControl: 'private, no-store',
        },
        record.storageProvider,
      );
      if (input.signal?.aborted) throw new Error('文件交付已取消');
      if (
        stored.objectKey !== objectKey ||
        Number(stored.size) !== input.buffer.length ||
        stored.sha256 !== expectedSha256
      ) {
        throw new Error('private storage write contract mismatch');
      }
      // 可空列写 null：实体属性未标 | null，用写入视图类型承接
      (record as FileAssetWriteValues).bucket = stored.bucket || null;
      record.objectKey = objectKey;
      record.size = input.buffer.length;
      record.sha256 = expectedSha256;
      record.status = 'active';
      record.metadata = baseMetadata;
      record = await this.fileAssetRepository.save(record);
    } catch (error) {
      try {
        await this.cleanupFileAssetRecord(record, 'create_failed');
      } catch {
        // The pre-created processing row retains the trusted object location
        // even when both storage cleanup and its status update fail.
        Logger.warn('私有文件创建失败，已保留可恢复清理记录', 'FileAssetService');
      }
      throw error;
    }

    return this.toFrontendFileAsset(record);
  }

  async createAvatarFromUrl(input: CreateAvatarFromUrlInput): Promise<FileAssetFrontendProjection> {
    const rawUrl = String(input?.url || '').trim();
    if (!rawUrl) {
      throw new BadRequestException('头像地址不能为空。');
    }

    const { buffer, contentType } = await safeDownloadToBuffer(rawUrl, {
      blockPrivateNetwork: true,
      maxBytes: MAX_AVATAR_BYTES,
      maxRedirects: 3,
      timeoutMs: 10_000,
    });
    const avatarType = detectAvatarImageType(buffer, contentType);
    if (!avatarType) {
      throw new BadRequestException('头像文件类型不受支持。');
    }

    const storage = this.requireStorageService();
    const fileId = await this.createUniqueFileId();
    // 写入与补偿删除用同一个存储实例：配置中途切换时，删的仍是写入的那一处
    const provider = await storage.createProvider('public');
    const objectKey = buildPublicAvatarObjectKey(fileId, avatarType.ext);
    const stored = await provider.putObject({
      objectKey,
      body: buffer,
      mime: avatarType.mime,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const record = await this.createRecordOrDiscardObject(provider, {
      fileId,
      userId: normalizeNullableNumber(input.userId),
      storageScope: 'public',
      storageProvider: provider.name,
      bucket: stored.bucket || null,
      objectKey: stored.objectKey,
      originalName: `avatar.${avatarType.ext}`,
      name: `avatar.${avatarType.ext}`,
      mime: avatarType.mime,
      ext: avatarType.ext,
      size: stored.size,
      sha256: stored.sha256 || createHash('sha256').update(buffer).digest('hex'),
      category: 'avatar',
      purpose: 'avatar',
      visibility: 'public',
      allowPreview: true,
      allowDownload: true,
      metadata: {
        source: 'third_party_avatar',
        provider: sanitizeMetadataText(input.provider),
      },
    });

    return this.toFrontendFileAsset(record);
  }

  /** 清理用户多余的旧头像；失败只记日志，不影响本次上传 */
  async pruneAvatarUploads(userId: number, keep = AVATAR_UPLOADS_KEPT): Promise<void> {
    const normalizedUserId = normalizeNullableNumber(userId);
    if (!normalizedUserId || !this.userRepository) return;
    try {
      const user = await this.userRepository.findOne({
        where: { id: normalizedUserId },
        select: { id: true, avatar: true, avatarFileId: true },
      });
      const inUse = new Set(
        [user?.avatarFileId, /\/files\/public\/([^/?#]+)/.exec(String(user?.avatar || ''))?.[1]]
          .map(value => String(value || '').trim())
          .filter(Boolean),
      );
      // 按 id 游标从新到旧分批走完，历史上积累的头像一次清到只剩保留数
      let seen = 0;
      let cursor: number | undefined;
      for (;;) {
        const query = this.fileAssetRepository
          .createQueryBuilder('file')
          .addSelect(['file.bucket', 'file.objectKey'])
          .where('file.userId = :userId', { userId: normalizedUserId })
          .andWhere('file.purpose = :purpose', { purpose: 'avatar' })
          .andWhere('file.storageScope = :storageScope', { storageScope: 'public' })
          .andWhere('file.status = :status', { status: 'active' });
        if (cursor !== undefined) query.andWhere('file.id < :beforeId', { beforeId: cursor });
        const batch = await query.orderBy('file.id', 'DESC').take(AVATAR_PRUNE_BATCH).getMany();
        for (const file of batch) {
          seen += 1;
          if (seen <= keep || inUse.has(file.fileId)) continue;
          await this.cleanupFileAssetRecord(file, 'avatar_pruned');
        }
        if (batch.length < AVATAR_PRUNE_BATCH) break;
        cursor = batch[batch.length - 1].id;
      }
    } catch {
      Logger.warn('清理旧头像失败，下次上传头像时重试', 'FileAssetService');
    }
  }

  async readFilesForRuntime(
    input: ReadFileAssetsForRuntimeInput,
  ): Promise<RuntimeInputFileAsset[]> {
    const userId = Number(input.userId);
    const actor =
      Number.isInteger(userId) && userId > 0 ? { id: userId } : { visitorId: input.visitorId };
    if (!actor.id && !actor.visitorId)
      throw new BadRequestException('Runtime 文件读取缺少有效归属。');
    const fileIds = uniqueRuntimeFileIds(input.fileIds);
    const maxFiles = Math.max(
      1,
      Math.min(DEFAULT_RUNTIME_MAX_FILES, Number(input.maxFiles) || DEFAULT_RUNTIME_MAX_FILES),
    );
    if (fileIds.length === 0) return [];
    if (fileIds.length > maxFiles) {
      throw new BadRequestException(`Runtime 输入文件不能超过 ${maxFiles} 个。`);
    }

    const allowedExtensions = normalizeAllowedExtensions(input.allowedExtensions);
    const maxBytes =
      Math.max(1, Number(input.maxFileSizeMb) || DEFAULT_RUNTIME_FILE_LIMIT_MB) * 1024 * 1024;
    const storage = this.requireStorageService();
    const files: RuntimeInputFileAsset[] = [];

    let totalBytes = 0;
    for (const fileId of fileIds) {
      const file = await this.findActiveForDownload(fileId, actor);
      const ext = normalizeFileExtension(file.ext || extname(file.name || ''));
      if (allowedExtensions.size > 0 && !allowedExtensions.has(ext)) {
        throw new BadRequestException('Runtime 输入文件类型不在允许范围内。');
      }
      const size = Number(file.size || 0);
      if (size > maxBytes) {
        throw new BadRequestException('Runtime 输入文件大小超出限制。');
      }
      const result = await storage.getObjectStream(
        file.storageScope,
        { bucket: file.bucket || undefined, objectKey: file.objectKey },
        file.storageProvider,
      );
      const buffer = await readStreamToBufferLimited(
        result.stream,
        Math.min(maxBytes, 200 * 1024 ** 2 - totalBytes),
      );
      totalBytes += buffer.length;
      await this.markAccessed(file.fileId);
      files.push({
        sourceKind: 'file',
        sourceRef: file.fileId,
        name: sanitizeRuntimeFileName(file.name || file.originalName || `${file.fileId}.${ext}`),
        originalName: sanitizeRuntimeFileName(
          file.originalName || file.name || `${file.fileId}.${ext}`,
        ),
        mime: file.mime || result.mime || 'application/octet-stream',
        ext,
        size: buffer.length,
        buffer,
        origin: file.origin || null,
      });
    }

    return files;
  }

  /** 宿主持久交付身份；没有用户内容，不依赖可被模型改写的 workspace manifest。 */
  async registerSandboxTurn(input: {
    ownerId: string;
    generation: string;
    userId?: number;
    visitorId?: string;
    messageId: string;
    turnId: string;
  }): Promise<void> {
    if (
      (!input.userId && !input.visitorId) ||
      !input.generation ||
      !/^[A-Za-z0-9_-]{1,96}$/u.test(input.turnId) ||
      !input.messageId
    )
      throw new BadRequestException('沙箱交付身份无效。');
    const fileId = `file_${createHash('sha256')
      .update(JSON.stringify([input.ownerId, input.generation, input.turnId, input.messageId]))
      .digest('hex')
      .slice(0, 24)}`;
    if (await this.fileAssetRepository.findOne({ where: { fileId } })) return;
    await this.createRecord({
      fileId,
      userId: input.userId,
      visitorId: input.visitorId,
      messageId: input.messageId,
      turnId: input.turnId,
      origin: 'sandbox_turn',
      storageScope: 'private',
      storageProvider: 'local',
      objectKey: '',
      name: 'sandbox-turn',
      originalName: 'sandbox-turn',
      mime: 'application/json',
      ext: 'json',
      size: 0,
      sha256: createHash('sha256').update('').digest('hex'),
      purpose: 'tool_output',
      category: 'generated',
      visibility: 'private',
      status: 'processing',
      allowPreview: false,
      allowDownload: false,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
      metadata: {
        sandboxOwner: input.ownerId,
        sandboxGeneration: input.generation,
        fileContentLifecycle: 'sandbox_turn',
      },
    });
  }
  async listSandboxTurns(input: {
    ownerId: string;
    generation: string;
    userId?: number;
    visitorId?: string;
  }): Promise<Array<{ fileId: string; turnId: string; messageId: string }>> {
    const rows = await this.fileAssetRepository
      .createQueryBuilder('file')
      .where(
        input.userId ? 'file.userId = :userId' : 'file.visitorId = :visitorId',
        input.userId ? { userId: input.userId } : { visitorId: input.visitorId },
      )
      .andWhere(input.userId ? 'file.visitorId IS NULL' : 'file.userId IS NULL')
      .andWhere('file.origin = :origin', { origin: 'sandbox_turn' })
      .andWhere('file.status = :status', { status: 'processing' })
      .andWhere('file.expiresAt > :now', { now: new Date() })
      // 先按对话与代次筛选再取前 200 条：登录用户多个对话共用一台沙箱，其他对话的登记不能挤掉本对话
      .andWhere("JSON_UNQUOTE(JSON_EXTRACT(file.metadata, '$.sandboxOwner')) = :sandboxOwner", {
        sandboxOwner: input.ownerId,
      })
      .andWhere(
        "JSON_UNQUOTE(JSON_EXTRACT(file.metadata, '$.sandboxGeneration')) = :sandboxGeneration",
        { sandboxGeneration: input.generation },
      )
      .orderBy('file.createdAt', 'ASC')
      .take(200)
      .getMany();
    return rows
      .filter(
        file =>
          file.metadata?.sandboxOwner === input.ownerId &&
          file.metadata?.sandboxGeneration === input.generation,
      )
      .map(file => ({ fileId: file.fileId, turnId: file.turnId!, messageId: file.messageId! }));
  }
  async completeSandboxTurn(fileId: string): Promise<void> {
    await this.fileAssetRepository.update(
      { fileId, origin: 'sandbox_turn', status: 'processing' },
      { status: 'deleted' },
    );
  }

  /** 技能是用户私有文件资产；访客临时下载可用，但不提供长期技能库。 */
  async listSandboxSkills(userId: number): Promise<FileAssetEntity[]> {
    if (!Number.isSafeInteger(userId) || userId <= 0) return [];
    return this.fileAssetRepository
      .createQueryBuilder('file')
      .where('file.userId = :userId', { userId })
      .andWhere('file.visitorId IS NULL')
      .andWhere('file.origin = :origin', { origin: 'sandbox_skill' })
      .andWhere('file.status = :status', { status: 'active' })
      .andWhere('(file.expiresAt IS NULL OR file.expiresAt > :now)', { now: new Date() })
      .orderBy('file.createdAt', 'DESC')
      .take(100)
      .getMany();
  }

  async saveSandboxSkill(
    userId: number,
    name: string,
    buffer: Buffer,
  ): Promise<FileAssetFrontendProjection> {
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(name) ||
      buffer.length > 3 * 1024 ** 2
    )
      throw new BadRequestException('技能保存参数无效。');
    const input: CreateFileAssetFromBufferInput = {
      userId,
      buffer,
      name: `${name}.skill.json`,
      mime: 'application/json',
      origin: 'sandbox_skill',
      purpose: 'tool_output',
      category: 'generated',
      visibility: 'private',
      expiresAt: null,
      metadata: { skillName: name, skillSchema: 1 },
      allowPreview: false,
    };
    return this.withPrivateWriteLock(input, async writer => {
      const current = await writer.listSandboxSkills(userId);
      const previous = current.filter(file => file.metadata?.skillName === name);
      const hash = createHash('sha256').update(buffer).digest('hex');
      if (previous[0]?.sha256 === hash) return this.toFrontendFileAsset(previous[0]);
      if (!previous.length && new Set(current.map(file => file.metadata?.skillName)).size >= 20)
        throw new BadRequestException('最多保留 20 个技能，请先删除不需要的技能。');
      const saved = await writer.createBufferInLock(input);
      for (const file of previous) await writer.cleanupFileAssetRecord(file, 'user_deleted');
      return saved;
    });
  }

  async deleteSandboxSkill(userId: number, name: string): Promise<void> {
    if (!this.quotaLockHeld)
      return this.withPrivateWriteLock({ userId }, writer =>
        writer.deleteSandboxSkill(userId, name),
      );
    for (const file of await this.listSandboxSkills(userId)) {
      if (file.metadata?.skillName === name) await this.deleteOwnedFile(file.fileId, userId);
    }
  }

  async queryAdminFiles(
    query: QueryAdminFileAssetInput,
  ): Promise<{ rows: AdminFileAssetListItem[]; count: number }> {
    const page = normalizePage(query?.page);
    const size = normalizePageSize(query?.size);
    const qb = this.fileAssetRepository.createQueryBuilder('file');

    const fileId = String(query?.fileId || '').trim();
    if (fileId) {
      qb.andWhere('file.fileId = :fileId', { fileId });
    }

    const keyword = String(query?.keyword || '').trim();
    if (keyword) {
      qb.andWhere('(file.fileId LIKE :keyword OR file.name LIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }

    const userId = Number(query?.userId);
    if (Number.isInteger(userId) && userId > 0) {
      qb.andWhere('file.userId = :userId', { userId });
    }

    if (isFileAssetVisibility(query?.visibility)) {
      qb.andWhere('file.visibility = :visibility', { visibility: query.visibility });
    }

    if (isFileAssetStatus(query?.status)) {
      qb.andWhere('file.status = :status', { status: query.status });
    } else {
      qb.andWhere('file.status = :activeStatus', { activeStatus: 'active' });
    }

    const origin = String(query?.origin || '').trim();
    if (origin) {
      qb.andWhere('file.origin = :origin', { origin });
    }

    const [rows, count] = await qb
      .orderBy('file.createdAt', 'DESC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    return {
      rows: rows.map(file => this.toAdminListItem(file)),
      count,
    };
  }

  async getAdminFileDetail(fileId: string): Promise<AdminFileAssetListItem> {
    if (!FILE_ID_PATTERN.test(String(fileId || ''))) {
      throw new NotFoundException('文件不存在或已失效。');
    }
    const file = await this.fileAssetRepository.findOne({ where: { fileId } });
    if (!file) throw new NotFoundException('文件不存在或已失效。');
    return this.toAdminListItem(file, true);
  }

  async batchDeleteFiles(fileIds: string[], actor: FileAssetAccessActor) {
    const ids = normalizeAdminFileIds(fileIds).slice(0, 100);
    if (ids.length === 0) {
      throw new BadRequestException('请选择需要清空的文件');
    }

    let matched = 0;
    let contentDeleted = 0;
    let missing = 0;
    let missingContent = 0;
    let markedDeleted = 0;
    let cleanupPending = 0;
    for (const fileId of ids) {
      const file = await this.findByFileIdForStorage(fileId);
      if (!file) {
        missing += 1;
        continue;
      }
      matched += 1;
      const result = await this.cleanupFileAssetRecord(file, 'deleted');
      if (result.deleted) {
        contentDeleted += 1;
        markedDeleted += 1;
      } else {
        cleanupPending += 1;
      }
      if (result.reason === 'missing') missingContent += 1;
    }

    Logger.warn(
      `超级管理员清空私有文件内容 | actor=${actor?.id || 'unknown'} | matched=${matched} | contentDeleted=${contentDeleted}`,
      'FileAssetSecurity',
    );

    return {
      requested: ids.length,
      matched,
      missing,
      contentDeleted,
      missingContent,
      markedDeleted,
      cleanupPending,
      blobDeleted: contentDeleted,
      missingBlob: missingContent,
    };
  }

  async clearFiles(
    input: { filters?: Record<string, any>; limit?: number; confirmText?: string },
    actor: FileAssetAccessActor,
  ) {
    if (input?.confirmText !== 'CLEAR_FILE_ASSETS') {
      throw new BadRequestException('缺少清空确认标记');
    }

    const limit = Math.min(Math.max(Math.floor(Number(input?.limit) || 100), 1), 500);
    const filters = normalizeClearFilters(input?.filters || {});
    const hasEffectiveFilter =
      Boolean(filters.status) ||
      Boolean(filters.visibility) ||
      Boolean(filters.origin) ||
      filters.userId !== undefined;
    if (!hasEffectiveFilter) {
      throw new BadRequestException('批量清空必须至少指定一个筛选条件');
    }

    const qb = this.fileAssetRepository
      .createQueryBuilder('file')
      .addSelect(['file.bucket', 'file.objectKey']);
    if (filters.status) qb.andWhere('file.status = :status', { status: filters.status });
    if (filters.visibility) {
      qb.andWhere('file.visibility = :visibility', { visibility: filters.visibility });
    }
    if (filters.origin) {
      qb.andWhere('file.origin = :origin', {
        origin: filters.origin,
      });
    }
    if (filters.userId) qb.andWhere('file.userId = :userId', { userId: filters.userId });

    const candidates = await qb.orderBy('file.createdAt', 'ASC').take(limit).getMany();
    let contentDeleted = 0;
    let missingContent = 0;
    let markedDeleted = 0;
    let cleanupPending = 0;
    for (const file of candidates) {
      const result = await this.cleanupFileAssetRecord(file, 'deleted');
      if (result.deleted) {
        contentDeleted += 1;
        markedDeleted += 1;
      } else {
        cleanupPending += 1;
      }
      if (result.reason === 'missing') missingContent += 1;
    }

    Logger.warn(
      `超级管理员按条件清空私有文件内容 | actor=${actor?.id || 'unknown'} | matched=${candidates.length} | contentDeleted=${contentDeleted}`,
      'FileAssetSecurity',
    );
    return {
      matched: candidates.length,
      contentDeleted,
      missingContent,
      markedDeleted,
      cleanupPending,
      blobDeleted: contentDeleted,
      missingBlob: missingContent,
    };
  }

  async deleteOwnedFile(
    fileId: string,
    userId: number,
  ): Promise<{ success: boolean; fileId: string; contentDeleted: boolean }> {
    const normalizedUserId = normalizeNullableNumber(userId);
    if (!normalizedUserId) {
      throw new BadRequestException('用户信息无效');
    }

    const normalizedFileId = String(fileId || '').trim();
    if (!FILE_ID_PATTERN.test(normalizedFileId)) {
      throw new NotFoundException('文件不存在或已失效。');
    }

    const file = await this.findByFileIdForStorage(normalizedFileId);
    if (!file) {
      throw new NotFoundException('文件不存在或已失效。');
    }

    this.assertActive(file);
    if (normalizeNullableNumber(file.userId) !== normalizedUserId) {
      throw new ForbiddenException('无权删除该文件。');
    }

    if (file.storageScope === 'private' && !this.quotaLockHeld)
      return this.withPrivateWriteLock(file, writer =>
        writer.deleteOwnedFile(normalizedFileId, normalizedUserId),
      );
    const result = await this.cleanupFileAssetRecord(file, 'user_deleted');
    if (!result.deleted) {
      throw new ServiceUnavailableException('文件清理暂未完成，请稍后重试。');
    }
    return {
      success: true,
      fileId: file.fileId,
      contentDeleted: result.deleted,
    };
  }

  /** 管理端「执行过期清理」：按创建时间取一批候选逐条清理（单条出错整批中止，由管理员重试） */
  async cleanupExpiredFiles(now = new Date()) {
    const staleBefore = new Date(now.getTime() - FILE_ASSET_PROCESSING_STALE_MS);
    const candidates = await this.whereCleanupCandidate(
      this.fileAssetRepository
        .createQueryBuilder('file')
        .addSelect(['file.bucket', 'file.objectKey']),
      now,
      staleBefore,
    )
      .orderBy('file.createdAt', 'ASC')
      .take(await this.getCleanupBatchSize())
      .getMany();
    let contentDeleted = 0;
    let cleanupPending = 0;
    for (const candidate of candidates) {
      const outcome = await this.cleanupCandidate(candidate, now, staleBefore);
      if (outcome === 'deleted') contentDeleted += 1;
      else if (outcome === 'pending') cleanupPending += 1;
    }

    return {
      scanned: candidates.length,
      expired: candidates.length,
      contentDeleted,
      cleanupPending,
      blobDeleted: contentDeleted,
    };
  }

  /** 自动清理一次完整扫描的上界：开始时候选里最大的 id，没有候选为 0 */
  async getCleanupScanUpperId(now = new Date()): Promise<number> {
    const staleBefore = new Date(now.getTime() - FILE_ASSET_PROCESSING_STALE_MS);
    const row = await this.whereCleanupCandidate(
      this.fileAssetRepository.createQueryBuilder('file').select('MAX(file.id)', 'maxId'),
      now,
      staleBefore,
    ).getRawOne();
    return Number(row?.maxId) || 0;
  }

  /**
   * 自动清理的一批：id 在 (after, upTo] 之间、按 id 升序取当时的候选。
   * 单条清理出错（账户锁繁忙、复查、存储删除、状态保存）记为失败并继续下一条，下一次完整扫描重试；
   * shouldStop 在每条开始前检查，停止时停在上一条之后。候选查询本身出错照常抛出。
   */
  async cleanupExpiredFilesInRange(
    range: { after: number; upTo: number },
    options: { now?: Date; shouldStop?: () => boolean } = {},
  ) {
    const now = options.now ?? new Date();
    const staleBefore = new Date(now.getTime() - FILE_ASSET_PROCESSING_STALE_MS);
    const limit = await this.getCleanupBatchSize();
    const candidates = await this.whereCleanupCandidate(
      this.fileAssetRepository
        .createQueryBuilder('file')
        .addSelect(['file.bucket', 'file.objectKey']),
      now,
      staleBefore,
    )
      .andWhere('file.id > :after AND file.id <= :upTo', { after: range.after, upTo: range.upTo })
      .orderBy('file.id', 'ASC')
      .take(limit)
      .getMany();
    let lastId = range.after;
    let contentDeleted = 0;
    let cleanupPending = 0;
    let failed = 0;
    let firstError: unknown;
    let interrupted = false;
    for (const candidate of candidates) {
      if (options.shouldStop?.()) {
        interrupted = true;
        break;
      }
      try {
        const outcome = await this.cleanupCandidate(candidate, now, staleBefore);
        if (outcome === 'deleted') contentDeleted += 1;
        else if (outcome === 'pending') cleanupPending += 1;
      } catch (error) {
        failed += 1;
        firstError ??= error;
      }
      lastId = Number(candidate.id);
    }
    return {
      limit,
      scanned: candidates.length,
      lastId,
      contentDeleted,
      cleanupPending,
      failed,
      firstError,
      reachedEnd: !interrupted && candidates.length < limit,
    };
  }

  private getCleanupBatchSize() {
    return this.getNumberConfig(
      'fileAssetCleanupBatchSize',
      DEFAULT_FILE_ASSET_CLEANUP_BATCH_SIZE,
      1,
      500,
    );
  }

  /** 清理候选：已到期的 active、failed、处理超时的 processing（未到期的沙箱登记除外）。手动与自动清理共用 */
  private whereCleanupCandidate<T extends SelectQueryBuilder<FileAssetEntity>>(
    qb: T,
    now: Date,
    staleBefore: Date,
  ): T {
    return qb.where(
      `(
          (file.status = :activeStatus AND file.expiresAt IS NOT NULL AND file.expiresAt <= :now)
          OR file.status = :failedStatus
          OR (file.status = :processingStatus AND file.updatedAt <= :staleBefore AND
            (file.origin IS NULL OR file.origin <> 'sandbox_turn' OR file.expiresAt <= :now))
        )`,
      {
        activeStatus: 'active',
        failedStatus: 'failed',
        processingStatus: 'processing',
        now,
        staleBefore,
      },
    ) as T;
  }

  /** 清理一条候选：私有文件在账户锁内按最新状态复查（等锁期间可能已被重新发布），不再符合条件就跳过 */
  private async cleanupCandidate(
    candidate: FileAssetEntity,
    now: Date,
    staleBefore: Date,
  ): Promise<'deleted' | 'pending' | 'skipped'> {
    let outcome: 'deleted' | 'pending' | 'skipped' = 'skipped';
    const cleanup = async (writer: FileAssetService) => {
      const file = await writer.findByFileIdForStorage(candidate.fileId);
      if (
        !file ||
        !(
          file.status === 'failed' ||
          (file.status === 'active' && file.expiresAt && file.expiresAt <= now) ||
          (file.status === 'processing' &&
            file.updatedAt <= staleBefore &&
            (file.origin !== 'sandbox_turn' || (file.expiresAt && file.expiresAt <= now)))
        )
      )
        return;
      const cleanupTarget =
        sanitizeMetadataText(file.metadata?.fileContentCleanupTarget) ||
        (file.status === 'active' ? 'expired' : file.turnId ? 'create_failed' : 'cleanup_retry');
      const result = await writer.cleanupFileAssetRecord(file, cleanupTarget);
      outcome = result.deleted ? 'deleted' : 'pending';
    };
    if (candidate.storageScope === 'private') await this.withPrivateWriteLock(candidate, cleanup);
    else await cleanup(this);
    return outcome;
  }

  assertPreviewAllowed(file: FileAssetEntity, actor: FileAssetAccessActor): void {
    this.assertAccessible(file, actor);
    if (!file.allowPreview) {
      throw new ForbiddenException('该文件不允许预览。');
    }
  }

  assertDownloadAllowed(file: FileAssetEntity, actor: FileAssetAccessActor): void {
    this.assertAccessible(file, actor);
    if (!file.allowDownload) {
      throw new ForbiddenException('该文件不允许下载。');
    }
  }

  assertAccessible(file: FileAssetEntity, actor: FileAssetAccessActor): void {
    this.assertActive(file);
    this.assertOwner(file, actor);
  }

  assertPublicAccessible(file: FileAssetEntity): void {
    this.assertActive(file);
    if (file.visibility !== 'public' || file.storageScope !== 'public') {
      throw new NotFoundException('文件不存在或已失效。');
    }
  }

  assertActive(file: FileAssetEntity): void {
    if (!file) {
      throw new NotFoundException('文件不存在或已失效。');
    }
    if (file.status !== 'active') {
      throw new GoneException('文件不存在或已失效。');
    }
    if (file.expiresAt && file.expiresAt.getTime() <= Date.now()) {
      file.status = 'expired';
      throw new GoneException('文件不存在或已失效。');
    }
  }

  assertOwner(file: FileAssetEntity, actor: FileAssetAccessActor): void {
    if (file.visibility === 'public' && file.storageScope === 'public') return;
    if (actor?.role === 'super') {
      Logger.warn(
        `file_super_access | fileId=${file.fileId} | actorId=${actor?.id || 'unknown'}`,
        'FileAssetService',
      );
      return;
    }

    const actorId = Number(actor?.id);
    if (file.userId && Number.isInteger(actorId) && file.userId === actorId) return;
    if (file.visitorId && actor?.visitorId && file.visitorId === actor.visitorId) return;

    throw new ForbiddenException('无权访问该文件。');
  }

  async resolvePrivateObjectPartition(input: {
    userId?: number | null;
    visitorId?: string | null;
  }): Promise<string> {
    const userId = normalizeNullableNumber(input.userId);
    if (userId) {
      const storageId = await this.resolveUserStorageId(userId);
      return `users/${sanitizeStoragePathSegment(storageId)}`;
    }

    const visitorId = String(input.visitorId || '').trim();
    if (visitorId) {
      return `visitors/${hashStorageSegment(visitorId)}`;
    }

    return 'system';
  }

  async assertUserQuotaAvailable(
    userId: number,
    incomingSize: number,
    replacingFileId?: string,
  ): Promise<void> {
    return this.assertActorQuotaAvailable({ userId }, incomingSize, replacingFileId);
  }

  /** 注册用户按 userId、访客按 visitorId 分别计量私有文件占用；两者配额独立配置 */
  async assertActorQuotaAvailable(
    actor: { userId?: number | null; visitorId?: string | null },
    incomingSize: number,
    replacingFileId?: string,
  ): Promise<void> {
    const size = Math.max(0, Number(incomingSize) || 0);
    if (size <= 0) return;
    const normalizedUserId = normalizeNullableNumber(actor.userId);
    const visitorId = normalizedUserId ? null : String(actor.visitorId || '').trim() || null;
    if (!normalizedUserId && !visitorId) return;

    const quotaMb = normalizedUserId
      ? await this.getNumberConfig(
          'fileAssetUserQuotaMb',
          DEFAULT_FILE_ASSET_USER_QUOTA_MB,
          0,
          102400,
        )
      : await this.getNumberConfig(
          'fileAssetVisitorQuotaMb',
          DEFAULT_FILE_ASSET_VISITOR_QUOTA_MB,
          0,
          102400,
        );
    if (quotaMb <= 0) return;

    const query = this.fileAssetRepository
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.size), 0)', 'total')
      .where(
        normalizedUserId ? 'file.userId = :userId' : 'file.visitorId = :visitorId',
        normalizedUserId ? { userId: normalizedUserId } : { visitorId },
      )
      .andWhere('file.status IN (:...quotaStatuses)', {
        quotaStatuses: ['active', 'processing', 'failed'],
      })
      .andWhere('file.storageScope = :storageScope', { storageScope: 'private' });
    if (replacingFileId) query.andWhere('file.fileId <> :replacingFileId', { replacingFileId });
    const raw = await query.getRawOne();
    const currentSize = Number(raw?.total || 0);
    const quotaBytes = quotaMb * 1024 * 1024;
    if (currentSize + size > quotaBytes) {
      throw new BadRequestException(
        `${normalizedUserId ? '用户' : '访客'}私有文件占用已超过 ${quotaMb} MB 上限。`,
      );
    }
  }

  toFrontendFileAsset(file: FileAssetEntity): FileAssetFrontendProjection {
    const projection: FileAssetFrontendProjection = {
      fileId: file.fileId,
      name: file.name,
      mime: file.mime,
      size: Number(file.size || 0),
      category: file.category,
      purpose: file.purpose,
      visibility: file.visibility,
    };

    if (file.allowPreview) {
      projection.previewUrl = `/api/files/${file.fileId}/preview`;
    }
    if (file.allowDownload) {
      projection.downloadUrl = `/api/files/${file.fileId}/download`;
    }
    if (file.storageScope === 'public' && file.visibility === 'public') {
      projection.publicUrl = `/api/files/public/${file.fileId}/preview`;
    }

    return projection;
  }

  private requireStorageService(): FileAssetStorageService {
    if (!this.fileAssetStorageService) {
      throw new BadRequestException('文件存储服务尚未初始化。');
    }
    return this.fileAssetStorageService;
  }

  private async resolveDefaultExpiresAt(visibility: FileAssetVisibility): Promise<Date | null> {
    if (visibility === 'public') return null;

    if (visibility === 'temporary') {
      const hours = await this.getNumberConfig(
        'fileAssetTemporaryRetentionHours',
        DEFAULT_FILE_ASSET_TEMPORARY_RETENTION_HOURS,
        1,
        8760,
      );
      return new Date(Date.now() + hours * 60 * 60 * 1000);
    }

    const days = await this.getNumberConfig(
      'fileAssetPrivateRetentionDays',
      DEFAULT_FILE_ASSET_PRIVATE_RETENTION_DAYS,
      0,
      3650,
    );
    if (days <= 0) return null;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async getNumberConfig(
    key: string,
    defaultValue: number,
    min: number,
    max: number,
  ): Promise<number> {
    if (!this.globalConfigService) return defaultValue;
    const configs = await this.globalConfigService.getConfigs([key]);
    const raw =
      typeof configs === 'object' && configs !== null
        ? (configs as Record<string, any>)[key]
        : configs;
    const parsed = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
    const value = Number.isFinite(parsed) ? parsed : defaultValue;
    return Math.max(min, Math.min(max, value));
  }

  private async findByFileIdForStorage(fileId: string): Promise<FileAssetEntity | null> {
    return await this.fileAssetRepository
      .createQueryBuilder('file')
      .addSelect(['file.bucket', 'file.objectKey'])
      .where('file.fileId = :fileId', { fileId })
      .getOne();
  }

  private toAdminListItem(file: FileAssetEntity, includeMetadata = false): AdminFileAssetListItem {
    return {
      fileId: file.fileId,
      name: file.name,
      userId: file.userId || null,
      visitorId: file.visitorId || null,
      size: Number(file.size || 0),
      sha256: file.sha256,
      visibility: file.visibility,
      status: file.status,
      mime: file.mime,
      ext: file.ext,
      category: file.category,
      purpose: file.purpose,
      origin: file.origin || null,
      allowPreview: Boolean(file.allowPreview),
      allowDownload: Boolean(file.allowDownload),
      contentAvailable: file.status === 'active',
      expiresAt: file.expiresAt || null,
      lastAccessedAt: file.lastAccessedAt || null,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      ...(includeMetadata ? { metadata: sanitizeFileAssetMetadata(file.metadata) } : {}),
    };
  }

  private async deleteStoredObjectForCleanup(
    file: FileAssetEntity,
  ): Promise<{ deleted: boolean; reason?: string }> {
    if (!file.objectKey) return { deleted: true, reason: 'missing' };
    try {
      await this.requireStorageService().deleteObject(
        file.storageScope,
        { bucket: file.bucket || undefined, objectKey: file.objectKey },
        file.storageProvider,
      );
      return { deleted: true };
    } catch (error) {
      if (isMissingStoredObjectError(error)) return { deleted: true, reason: 'missing' };
      Logger.warn('清空文件内容失败，稍后重试', 'FileAssetService');
      return { deleted: false, reason: 'failed' };
    }
  }

  private async cleanupFileAssetRecord(
    file: FileAssetEntity,
    target: string,
  ): Promise<{ deleted: boolean; reason?: string }> {
    if (file.storageScope === 'private' && !this.quotaLockHeld) {
      return this.withPrivateWriteLock(file, async writer => {
        const fresh = await writer.findByFileIdForStorage(file.fileId);
        if (!fresh || fresh.status === 'deleted') return { deleted: true, reason: 'missing' };
        return writer.cleanupFileAssetRecord(fresh, target);
      });
    }
    if (file.objectKey === undefined) {
      // 存储列是 select: false，调用方的查询漏选时按 fileId 补查；否则会被当成对象已不存在，只标删除、留下文件
      const stored = await this.findByFileIdForStorage(file.fileId);
      if (!stored || stored.status === 'deleted') return { deleted: true, reason: 'missing' };
      file = stored;
    }
    const safeTarget = sanitizeMetadataText(target) || 'cleanup';
    // Confirm a live lock connection and reserve quota before touching the object.
    await this.markFileCleanupPending(file, safeTarget, 'pending', 'processing');
    const result = await this.deleteStoredObjectForCleanup(file);
    if (result.deleted) {
      await this.markFileDeleted(file, safeTarget, result.reason);
      return result;
    }
    await this.markFileCleanupPending(file, safeTarget, result.reason || 'failed', 'failed');
    return result;
  }

  private async markFileCleanupPending(
    file: FileAssetEntity,
    target: string,
    result: string,
    status: Extract<FileAssetStatus, 'processing' | 'failed'>,
  ): Promise<void> {
    file.status = status;
    file.metadata = {
      ...(file.metadata || {}),
      fileContentLifecycle: 'cleanup_pending',
      fileContentCleanupTarget: target,
      fileContentCleanupResult: result,
      fileContentCleanupUpdatedAt: new Date().toISOString(),
    };
    await this.saveInactiveFileAndInvalidateIndex(file);
  }

  private async markFileDeleted(
    file: FileAssetEntity,
    target: string,
    reason?: string,
  ): Promise<void> {
    file.status = 'deleted';
    file.metadata = {
      ...(file.metadata || {}),
      fileContentLifecycle: 'deleted',
      fileContentDeletedAt: new Date().toISOString(),
      fileContentCleanupTarget: target,
      fileContentCleanupResult: reason === 'missing' ? 'missing' : target,
    };
    await this.saveInactiveFileAndInvalidateIndex(file);
  }

  private async saveInactiveFileAndInvalidateIndex(file: FileAssetEntity): Promise<void> {
    const manager = this.fileAssetRepository.manager;
    if (!Number.isInteger(Number(file.id)) || typeof manager?.transaction !== 'function') {
      await this.fileAssetRepository.save(file);
      return;
    }

    await manager.transaction(async transaction => {
      const lockedFile = await transaction.findOne(FileAssetEntity, {
        where: { id: Number(file.id) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedFile) return;
      lockedFile.status = file.status;
      lockedFile.metadata = file.metadata;
      await transaction.save(FileAssetEntity, lockedFile);
      // 未选出的存储列在实体上仍可能是 undefined，不能覆盖调用方已读取的对象位置。
      file.status = lockedFile.status;
      file.metadata = lockedFile.metadata;
      file.updatedAt = lockedFile.updatedAt;
    });
  }

  private async resolveUserStorageId(userId: number): Promise<string> {
    if (!this.userRepository) {
      return stableFallbackStorageId(`user:${userId}`);
    }

    const current = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, storageId: true },
    });
    if (!current) {
      return stableFallbackStorageId(`missing-user:${userId}`);
    }
    if (current.storageId) {
      return sanitizeStoragePathSegment(current.storageId);
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const storageId = createStorageId();
      try {
        await this.userRepository.update({ id: userId }, { storageId });
        return storageId;
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    const refreshed = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, storageId: true },
    });
    if (refreshed?.storageId) {
      return sanitizeStoragePathSegment(refreshed.storageId);
    }
    throw new Error('User storageId generation failed');
  }
}
