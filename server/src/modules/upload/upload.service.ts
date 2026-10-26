import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { REGISTERED_USER_REQUIRED_MESSAGE } from '@/common/auth/request-user';
import * as mime from 'mime-types';
import * as path from 'path';
import { FileAssetStorageService } from '../fileAsset/fileAsset-storage.service';
import {
  FileAssetCategory,
  FileAssetPurpose,
  FileAssetVisibility,
} from '../fileAsset/fileAsset.entity';
import { FileAssetService, MAX_AVATAR_BYTES } from '../fileAsset/fileAsset.service';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { RedisCacheService } from '../redisCache/redisCache.service';

/** Multer 解析出的上传文件：只声明本服务实际读取的字段 */
export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size?: number;
  originalname?: string;
  filename?: string;
}

// 普通用户可上传的扩展名；SVG 只在 super 管理员分支额外放行。
const whitelist = [
  // 图片格式
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'ico',
  'avif',
  'tif',
  'tiff',
  'psd',
  'raw',
  'heic',
  'heif',
  // 视频格式
  'mp4',
  'avi',
  'mov',
  'wmv',
  'flv',
  'mkv',
  'webm',
  'm4v',
  'mpg',
  'mpeg',
  '3gp',
  'ogv',
  'ts',
  'm3u8',
  // 音频格式（TTS 生成音频、语音类产物）
  'mp3',
  'mpga',
  'm4a',
  'wav',
  'ogg',
  'oga',
  'opus',
  'aac',
  'flac',
  // 文档格式
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'csv',
  'json',
  'xml',
  'md',
  // 压缩包：在沙箱里解压处理（批量图片、素材包等）
  'zip',
];

const DEFAULT_FILE_ASSET_MAX_FILE_SIZE_MB = 50;

/** file_assets.name / originalName 的列宽（字符数） */
const FILE_NAME_MAX_CHARS = 255;

@Injectable()
export class UploadService implements OnModuleInit {
  constructor(
    private readonly globalConfigService: GlobalConfigService,
    private readonly redisCacheService: RedisCacheService,
    private readonly fileAssetService?: FileAssetService,
    private readonly fileAssetStorageService?: FileAssetStorageService,
  ) {}

  onModuleInit() {}

  /**
   * 验证文件内容（magic bytes）与扩展名是否匹配
   * 防止通过伪造 Content-Type 头绕过白名单
   */
  private validateFileMagic(buffer: Buffer, extension: string): boolean {
    // 文件格式对应的 magic bytes（十六进制）
    const signatures: Record<string, number[][]> = {
      jpg: [[0xff, 0xd8, 0xff]],
      jpeg: [[0xff, 0xd8, 0xff]],
      png: [[0x89, 0x50, 0x4e, 0x47]],
      gif: [[0x47, 0x49, 0x46, 0x38]],
      webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF header (WebP starts with RIFF...WEBP)
      bmp: [[0x42, 0x4d]],
      avif: [[0x00, 0x00, 0x00]], // ftyp box
      ico: [[0x00, 0x00, 0x01, 0x00]],
      tif: [[0x49, 0x49, 0x2a, 0x00]],
      tiff: [[0x49, 0x49, 0x2a, 0x00]],
      psd: [[0x38, 0x42, 0x50, 0x53]],
      mp4: [[0x00, 0x00, 0x00]], // ftyp box
      avi: [[0x52, 0x49, 0x46, 0x46]],
      mkv: [[0x1a, 0x45, 0xdf, 0xa3]],
      webm: [[0x1a, 0x45, 0xdf, 0xa3]],
      mov: [[0x00, 0x00, 0x00]],
      flv: [[0x46, 0x4c, 0x56]],
      pdf: [[0x25, 0x50, 0x44, 0x46]],
      doc: [[0xd0, 0xcf, 0x11, 0xe0]], // OLE2 compound document
      xls: [[0xd0, 0xcf, 0x11, 0xe0]],
      ppt: [[0xd0, 0xcf, 0x11, 0xe0]],
      docx: [[0x50, 0x4b, 0x03, 0x04]], // ZIP-based (Office Open XML)
      xlsx: [[0x50, 0x4b, 0x03, 0x04]],
      pptx: [[0x50, 0x4b, 0x03, 0x04]],
      odt: [[0x50, 0x4b, 0x03, 0x04]], // ZIP-based
      ods: [[0x50, 0x4b, 0x03, 0x04]],
      odp: [[0x50, 0x4b, 0x03, 0x04]],
      zip: [[0x50, 0x4b, 0x03, 0x04]],
    };

    const ext = extension.toLowerCase();

    // 无固定签名的纯文本格式，跳过校验
    const textFormats = [
      'txt',
      'rtf',
      'csv',
      'json',
      'xml',
      'md',
      'svg',
      'ts',
      'm3u8',
      'mpg',
      'mpeg',
      '3gp',
      'ogv',
      'm4v',
      'wmv',
      'heic',
      'heif',
      'raw',
      'odt',
    ];
    if (textFormats.includes(ext)) {
      return true;
    }

    const expected = signatures[ext];
    if (!expected) {
      return true; // 未配置签名的格式，放行
    }

    if (!buffer || buffer.length < 4) {
      return false;
    }

    return expected.some(sig => sig.every((byte, i) => buffer[i] === byte));
  }

  // 检查用户上传频率（访客的 id 是 visitorId 字符串，只进 Redis 键）
  private async checkUploadFrequency(userId: number | string): Promise<void> {
    const hourlyKey = `upload:frequency:${userId}:${new Date().getHours()}`;

    // 获取当前小时的上传次数
    const uploadCount = await this.redisCacheService.get({ key: hourlyKey });
    const count = uploadCount ? parseInt(uploadCount) : 0;

    // 检查是否超过限制(1小时100次)
    if (count >= 100) {
      throw new HttpException('您的上传频率过高，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    // 更新上传次数，设置过期时间为1小时
    await this.redisCacheService.set({ key: hourlyKey, val: (count + 1).toString() }, 3600);
  }

  private async validateUploadFile(
    file: UploadedFileLike,
    user: { id?: number | string; role?: string } | null = null,
  ) {
    // 如果存在用户信息，则进行频率检查
    if (user && user.id) {
      await this.checkUploadFrequency(user.id);
    }

    const { buffer, mimetype, size } = file;

    const maxFileSizeMb = await this.getUserFileMaxSizeMb();
    const maxSize = maxFileSizeMb * 1024 * 1024;

    // 获取实际文件大小（优先使用 size，如果不存在则使用 buffer.length）
    const fileSize = size || buffer?.length || 0;

    // 检查文件大小
    if (fileSize > maxSize) {
      const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
      Logger.error('文件过大', 'UploadService');
      throw new HttpException(
        `文件大小超出限制，当前: ${fileSizeMB}MB，最大支持: ${maxFileSizeMb}MB`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // 同时校验 Content-Type 推导扩展名和用户原始文件名扩展名，避免扩展名/MIME/内容三者互相伪装。
    const mimeExtension = this.normalizeMimeExtension(mimetype);
    const originalExtension = this.getOriginalFileExtension(file);
    const fileExtension = this.resolveEffectiveUploadExtension(mimeExtension, originalExtension);
    if (!fileExtension) {
      Logger.error('无法识别文件类型，请检查文件', 'UploadService');

      // throw new HttpException(
      //   '无法识别文件类型，请检查文件',
      //   HttpStatus.UNSUPPORTED_MEDIA_TYPE
      // );
    }

    // 检查文件扩展名是否在白名单中（super 管理员额外允许 SVG）
    const allowedExtensions = user?.role === 'super' ? [...whitelist, 'svg'] : whitelist;
    if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
      Logger.error('不允许上传此类型的文件', 'UploadService');
      throw new HttpException(
        `不支持的文件类型: .${fileExtension}，仅支持图片、视频、文档格式`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    if (originalExtension && !allowedExtensions.includes(originalExtension)) {
      Logger.error('不允许上传此原始扩展名', 'UploadService');
      throw new HttpException(
        `不支持的文件类型: .${originalExtension}，仅支持图片、视频、文档格式`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    if (
      mimeExtension &&
      originalExtension &&
      !this.areUploadExtensionsCompatible(originalExtension, mimeExtension)
    ) {
      Logger.warn('文件扩展名与 MIME 不匹配', 'UploadService');
      throw new HttpException('文件扩展名与声明类型不一致，请检查文件', HttpStatus.BAD_REQUEST);
    }

    // 验证文件内容（magic bytes）与声称的扩展名是否匹配
    if (!this.validateFileMagic(buffer, fileExtension)) {
      Logger.error('文件内容与类型不匹配', 'UploadService');
      throw new HttpException(
        `文件内容与声明的类型不一致，请上传真实的 .${fileExtension} 文件`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      buffer,
      mimetype,
      fileExtension: fileExtension.toLowerCase(),
      fileSize,
    };
  }

  async uploadFileAsset(
    file: UploadedFileLike,
    options: {
      dir?: string;
      user?: any;
      purpose?: string;
      visibility?: string;
    } = {},
  ) {
    if (!this.fileAssetService || !this.fileAssetStorageService) {
      throw new HttpException('FileAsset 上传服务未初始化', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const { buffer, mimetype, fileExtension, fileSize } = await this.validateUploadFile(
      file,
      options.user,
    );
    const originalName = this.normalizeUploadedOriginalName(file, fileExtension);
    const purpose = this.resolveFileAssetPurpose({
      purpose: options.purpose,
      mimeType: mimetype,
      dir: options.dir,
    });
    // 头像是唯一允许普通用户公开上传的用途：只接受位图，杜绝 SVG / XML 之类可执行脚本的「图片」
    if (
      purpose === 'avatar' &&
      (!String(mimetype || '').startsWith('image/') ||
        String(mimetype || '').includes('svg') ||
        fileExtension === 'svg')
    ) {
      throw new HttpException('头像只能上传 JPG / PNG / GIF / WebP 等位图', HttpStatus.BAD_REQUEST);
    }
    if (purpose === 'avatar' && fileSize > MAX_AVATAR_BYTES) {
      throw new HttpException('头像不能超过 5 MB', HttpStatus.BAD_REQUEST);
    }
    const visibility = this.resolveFileAssetVisibility({
      visibility: options.visibility,
      purpose,
      user: options.user,
    });
    const storageScope = visibility === 'public' ? 'public' : 'private';
    const category = this.resolveFileAssetCategory(purpose, mimetype);
    const actor = this.resolveFileAssetOwner(options.user);
    if (storageScope === 'private') {
      return this.fileAssetService.createFromBuffer({
        buffer,
        name: originalName,
        mime: mimetype,
        ...actor,
        purpose,
        category,
        visibility,
        allowPreview: this.isPreviewable(mimetype, fileExtension),
        allowDownload: true,
        metadata: { uploadDir: this.normalizeMetadataDir(options.dir) },
      });
    }
    // 私有上传在 createFromBuffer 里按字节截断；公开上传直接建档，在这里截到列宽
    const publicName = this.fitFileNameToColumn(originalName, fileExtension);
    const fileId = await this.fileAssetService.createUniqueFileId();
    // 写入与补偿删除用同一个存储实例：配置中途切换时，删的仍是写入的那一处
    const provider = await this.fileAssetStorageService.createProvider(storageScope);
    const privatePartition: string | undefined = undefined;
    const objectKey = this.buildFileAssetObjectKey({
      storageScope,
      purpose,
      fileId,
      extension: fileExtension,
      privatePartition,
    });

    const stored = await provider.putObject({
      objectKey,
      body: buffer,
      mime: mimetype,
      cacheControl:
        storageScope === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
    });

    const record = await this.fileAssetService.createRecordOrDiscardObject(provider, {
      fileId,
      userId: actor.userId,
      visitorId: actor.visitorId,
      storageScope,
      storageProvider: provider.name,
      bucket: stored.bucket || undefined,
      objectKey: stored.objectKey,
      originalName: publicName,
      name: publicName,
      mime: mimetype,
      ext: fileExtension,
      size: stored.size || fileSize,
      sha256: stored.sha256,
      category,
      purpose,
      visibility,
      allowPreview: this.isPreviewable(mimetype, fileExtension),
      allowDownload: true,
      metadata: {
        uploadDir: this.normalizeMetadataDir(options.dir),
      },
    });

    Logger.log('FileAsset 上传完成', 'UploadService');
    if (purpose === 'avatar' && actor.userId) {
      await this.fileAssetService.pruneAvatarUploads(actor.userId);
    }
    return this.fileAssetService.toFrontendFileAsset(record);
  }

  private resolveFileAssetPurpose(input: {
    purpose?: string;
    mimeType?: string;
    dir?: string;
  }): FileAssetPurpose {
    const explicit = String(input.purpose || '').trim() as FileAssetPurpose;
    const allowed: FileAssetPurpose[] = [
      'chat_image',
      'chat_video',
      'chat_audio',
      'chat_file',
      'avatar',
      'public_asset',
      'temp_upload',
    ];
    if (explicit && allowed.includes(explicit)) return explicit;

    if (input.mimeType?.startsWith('image/')) return 'chat_image';
    if (input.mimeType?.startsWith('video/')) return 'chat_video';
    if (input.mimeType?.startsWith('audio/')) return 'chat_audio';
    return 'chat_file';
  }

  private resolveFileAssetVisibility(input: {
    visibility?: string;
    purpose: FileAssetPurpose;
    user?: any;
  }): FileAssetVisibility {
    const requested = String(input.visibility || '').trim();
    if (requested === 'public') {
      // 公开文件不计配额、不过期、任何人可读：访客身份任何人都能领取，不能用它匿名托管公开文件
      if (input.user?.role === 'visitor') {
        throw new HttpException(REGISTERED_USER_REQUIRED_MESSAGE, HttpStatus.FORBIDDEN);
      }
      const isPublicPurpose = input.purpose === 'avatar' || input.purpose === 'public_asset';
      const isPrivileged = ['admin', 'super'].includes(input.user?.role);
      if (input.purpose === 'public_asset' && !isPrivileged) {
        throw new HttpException('无权上传公开站点资源', HttpStatus.FORBIDDEN);
      }
      if (!isPublicPurpose) {
        throw new HttpException('该文件用途不允许公开上传', HttpStatus.BAD_REQUEST);
      }
      return 'public';
    }
    if (requested === 'temporary') return 'temporary';
    return 'private';
  }

  private resolveFileAssetCategory(purpose: FileAssetPurpose, mimeType: string): FileAssetCategory {
    if (purpose === 'avatar') return 'avatar';
    if (purpose === 'public_asset') return 'system';
    if (
      mimeType?.startsWith('image/') ||
      mimeType?.startsWith('video/') ||
      mimeType?.startsWith('audio/')
    ) {
      return 'media';
    }
    return 'file';
  }

  private resolveFileAssetOwner(user?: any): { userId?: number | null; visitorId?: string | null } {
    if (!user?.id) return { userId: null, visitorId: null };
    if (user.role === 'visitor') return { userId: null, visitorId: String(user.id) };
    const userId = Number(user.id);
    return Number.isInteger(userId)
      ? { userId, visitorId: null }
      : { userId: null, visitorId: null };
  }

  private buildFileAssetObjectKey(input: {
    storageScope: 'public' | 'private';
    purpose: FileAssetPurpose;
    fileId: string;
    extension: string;
    privatePartition?: string;
  }): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const ext = input.extension ? `.${input.extension}` : '';

    if (input.purpose === 'avatar') return `avatars/${year}${month}/${input.fileId}${ext}`;
    if (input.storageScope === 'public') return `public/${year}${month}/${input.fileId}${ext}`;
    const partition = this.sanitizeObjectKeyPrefix(input.privatePartition || 'system');
    return `${partition}/private/${year}${month}/${input.fileId}${ext}`;
  }

  private normalizeMimeExtension(mimetype: string): string {
    const normalizedMime = String(mimetype || '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (!normalizedMime || normalizedMime === 'application/octet-stream') return '';
    const extension = String(mime.extension(normalizedMime) || '')
      .trim()
      .replace(/^\./, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24);
    // mime-types 3 把 audio/aac 反查成 adts（2.x 返回空），归一到白名单里的 aac
    return extension === 'adts' ? 'aac' : extension;
  }

  private getOriginalFileExtension(file: any): string {
    const name = this.normalizeUploadedOriginalName(file);
    return path
      .extname(name)
      .replace(/^\./, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 24);
  }

  /** file_assets 的 name / originalName 列宽 255（按字符计）：超出时截断主名，并以已校验的扩展名结尾 */
  private fitFileNameToColumn(name: string, extension: string): string {
    const chars = Array.from(name);
    if (chars.length <= FILE_NAME_MAX_CHARS) return name;
    const suffix = extension ? `.${extension}` : '';
    const tail = chars.slice(chars.length - suffix.length).join('');
    const keepsSuffix = !!suffix && tail.toLowerCase() === suffix;
    const stem = keepsSuffix ? chars.slice(0, chars.length - suffix.length) : chars;
    const ending = keepsSuffix ? tail : suffix;
    return stem.slice(0, FILE_NAME_MAX_CHARS - Array.from(ending).length).join('') + ending;
  }

  private normalizeUploadedOriginalName(file: any, extension = ''): string {
    const fallback = extension ? `file.${extension}` : 'file';
    const raw = String(file?.originalname || file?.filename || '')
      .replace(/\0/g, '')
      .trim();
    if (!raw) return fallback;

    const basename = path.basename(raw);
    const decoded = this.decodeMojibakeFilename(basename);
    return decoded || fallback;
  }

  private decodeMojibakeFilename(filename: string): string {
    const raw = String(filename || '').trim();
    if (!raw) return '';

    const decoded = Buffer.from(raw, 'latin1').toString('utf8').trim();
    if (!decoded || decoded.includes('\uFFFD')) return raw;

    return this.filenameDecodeScore(decoded) > this.filenameDecodeScore(raw) ? decoded : raw;
  }

  private filenameDecodeScore(value: string): number {
    const text = String(value || '');
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const mojibakeCount = (text.match(/[ÃÂâäåæçèéìíîïðñòóôõöùúûüýþÿ]/g) || []).length;
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    return cjkCount * 3 - mojibakeCount * 2 - replacementCount * 10;
  }

  private resolveEffectiveUploadExtension(
    mimeExtension: string,
    originalExtension: string,
  ): string {
    if (
      originalExtension &&
      (!mimeExtension || this.areUploadExtensionsCompatible(originalExtension, mimeExtension))
    ) {
      return originalExtension;
    }
    return mimeExtension || originalExtension;
  }

  private areUploadExtensionsCompatible(originalExtension: string, mimeExtension: string): boolean {
    const original = originalExtension.toLowerCase();
    const derived = mimeExtension.toLowerCase();
    if (original === derived) return true;

    const equivalentGroups = [
      ['jpg', 'jpeg'],
      ['tif', 'tiff'],
      ['mp3', 'mpga'],
      ['mp4', 'm4a', 'm4v'],
      ['heic', 'heif'],
      ['htm', 'html'],
    ];
    return equivalentGroups.some(group => group.includes(original) && group.includes(derived));
  }

  private sanitizeObjectKeyPrefix(value: string): string {
    const parts = String(value || '')
      .split('/')
      .map(item =>
        item
          .trim()
          .replace(/[^A-Za-z0-9_-]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 64),
      )
      .filter(Boolean);
    return parts.length > 0 ? parts.join('/') : 'system';
  }

  private normalizeMetadataDir(dir?: string): string | undefined {
    const value = String(dir || '').trim();
    return value ? value.slice(0, 120) : undefined;
  }

  private isPreviewable(mimeType: string, extension: string): boolean {
    if (
      mimeType?.startsWith('image/') ||
      mimeType?.startsWith('video/') ||
      mimeType?.startsWith('audio/')
    ) {
      return true;
    }
    // XML 可承载 XHTML / XSLT 脚本，不允许内联预览
    return ['pdf', 'txt', 'md', 'csv', 'json'].includes(extension);
  }

  private async getUserFileMaxSizeMb(): Promise<number> {
    const configs = await this.globalConfigService.getConfigs(['fileAssetMaxFileSizeMb']);
    const raw =
      typeof configs === 'object' && configs !== null
        ? (configs as Record<string, any>).fileAssetMaxFileSizeMb
        : configs;
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : DEFAULT_FILE_ASSET_MAX_FILE_SIZE_MB;
    return Math.max(1, Math.min(1024, value));
  }
}
