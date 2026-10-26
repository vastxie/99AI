import { HttpStatus } from '@nestjs/common';
import { UploadService } from './upload.service';
import type { CreateFileAssetFromBufferInput } from '../fileAsset/fileAsset.types';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('UploadService', () => {
  let service: UploadService;
  let globalConfigService: any;
  let redisCacheService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue(20),
    };
    redisCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    service = new UploadService(globalConfigService as any, redisCacheService as any);
  });

  describe('validateUploadFile', () => {
    it('rejects files when original extension and MIME extension conflict', async () => {
      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from('%PDF-1.7\n'),
          mimetype: 'application/pdf',
          originalname: 'payload.jpg',
          size: 8,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('accepts files when original extension MIME and magic bytes match', async () => {
      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from('%PDF-1.7\n'),
          mimetype: 'application/pdf',
          originalname: 'report.pdf',
          size: 8,
        }),
      ).resolves.toMatchObject({
        fileExtension: 'pdf',
      });
    });

    it('accepts zip archives only when the content is a real ZIP', async () => {
      // 压缩包（批量图片、素材包）上传后在沙箱里解压；内容必须是 ZIP，不能冒名
      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
          mimetype: 'application/zip',
          originalname: '商品图.zip',
          size: 6,
        }),
      ).resolves.toMatchObject({ fileExtension: 'zip' });
      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from('MZ\x90\x00'),
          mimetype: 'application/octet-stream',
          originalname: 'payload.zip',
          size: 4,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('accepts AAC audio declared as audio/aac', async () => {
      // mime-types 3 把 audio/aac 反查成 adts；必须归一到白名单里的 aac，否则合法语音上传会被拒
      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x00, 0x1f, 0xfc]),
          mimetype: 'audio/aac',
          originalname: 'voice.aac',
          size: 7,
        }),
      ).resolves.toMatchObject({ fileExtension: 'aac' });
    });

    it('still rejects audio/aac content disguised under another extension', async () => {
      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x00, 0x1f, 0xfc]),
          mimetype: 'audio/aac',
          originalname: 'voice.mp3',
          size: 7,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('detects extensions from mojibake Chinese filenames', async () => {
      const filename = Buffer.from('计费说明.txt', 'utf8').toString('latin1');

      await expect(
        (service as any).validateUploadFile({
          buffer: Buffer.from('hello'),
          mimetype: 'text/plain',
          originalname: filename,
          size: 5,
        }),
      ).resolves.toMatchObject({
        fileExtension: 'txt',
      });
    });
  });

  describe('uploadFileAsset', () => {
    it('refuses public uploads from visitors before touching storage or records', async () => {
      const fileAssetService = {
        createFromBuffer: jest.fn(),
        createUniqueFileId: jest.fn(),
        assertActorQuotaAvailable: jest.fn(),
        resolvePrivateObjectPartition: jest.fn(),
        createRecord: jest.fn(),
        toFrontendFileAsset: jest.fn(),
      };
      const storageService = { resolveProviderName: jest.fn(), putObject: jest.fn() };
      const uploadService = new UploadService(
        globalConfigService as any,
        redisCacheService as any,
        fileAssetService as any,
        storageService as any,
      );
      const avatar = {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
        mimetype: 'image/png',
        originalname: 'avatar.png',
        size: 12,
      };

      await expect(
        uploadService.uploadFileAsset(avatar, {
          user: { id: 'visitor:abc123', role: 'visitor' },
          purpose: 'avatar',
          visibility: 'public',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN, message: '该功能需要登录正式账号' });
      expect(storageService.putObject).not.toHaveBeenCalled();
      expect(fileAssetService.createRecord).not.toHaveBeenCalled();
      expect(fileAssetService.createFromBuffer).not.toHaveBeenCalled();
    });

    /** 公开上传的存储实例替身：写入与补偿都经过同一个实例 */
    const createPublicUpload = () => {
      const fileAssetService = {
        createFromBuffer: jest.fn(),
        createUniqueFileId: jest.fn().mockResolvedValue('file_abcdefghijklmnopqrstuvwx'),
        assertActorQuotaAvailable: jest.fn(),
        resolvePrivateObjectPartition: jest.fn(),
        createRecordOrDiscardObject: jest.fn(async (_provider: unknown, input: any) => input),
        toFrontendFileAsset: jest.fn((record: any) => ({
          fileId: record.fileId,
          name: record.name,
        })),
        pruneAvatarUploads: jest.fn(async (): Promise<void> => undefined),
      };
      const provider = {
        name: 'demo_store',
        putObject: jest.fn(async (input: any) => ({
          bucket: 'public-bucket',
          objectKey: input.objectKey,
          size: input.body.length,
          sha256: 'sha256-avatar',
        })),
      };
      const storageService = { createProvider: jest.fn().mockResolvedValue(provider) };
      const uploadService = new UploadService(
        globalConfigService as any,
        redisCacheService as any,
        fileAssetService as any,
        storageService as any,
      );
      return { fileAssetService, provider, storageService, uploadService };
    };

    it('caps avatar size and prunes old avatars after a public avatar upload', async () => {
      const { fileAssetService, provider, storageService, uploadService } = createPublicUpload();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

      await expect(
        uploadService.uploadFileAsset(
          {
            buffer: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]),
            mimetype: 'image/png',
            originalname: 'avatar.png',
            size: png.length + 5 * 1024 * 1024,
          },
          { user: { id: 7, role: 'user' }, purpose: 'avatar', visibility: 'public' },
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST, message: '头像不能超过 5 MB' });
      expect(storageService.createProvider).not.toHaveBeenCalled();

      await uploadService.uploadFileAsset(
        { buffer: png, mimetype: 'image/png', originalname: 'avatar.png', size: png.length },
        { user: { id: 7, role: 'user' }, purpose: 'avatar', visibility: 'public' },
      );
      expect(storageService.createProvider).toHaveBeenCalledWith('public');
      expect(provider.putObject).toHaveBeenCalledTimes(1);
      // 建档拿到的是写入用的同一个实例，记录的存储服务名取自它
      expect(fileAssetService.createRecordOrDiscardObject).toHaveBeenCalledWith(
        provider,
        expect.objectContaining({ storageProvider: 'demo_store', bucket: 'public-bucket' }),
      );
      expect(fileAssetService.pruneAvatarUploads).toHaveBeenCalledWith(7);
    });

    it('fits over-long public file names into the 255-character column keeping the extension', async () => {
      const { fileAssetService, uploadService } = createPublicUpload();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const upload = (originalname: string) =>
        uploadService.uploadFileAsset(
          { buffer: png, mimetype: 'image/png', originalname, size: png.length },
          { user: { id: 7, role: 'user' }, purpose: 'avatar', visibility: 'public' },
        );
      const recorded = () => fileAssetService.createRecordOrDiscardObject.mock.calls.at(-1)[1];

      await upload(`${'长'.repeat(300)}.png`);
      expect(Array.from(recorded().name)).toHaveLength(255);
      expect(recorded().name.endsWith('.png')).toBe(true);
      expect(recorded().originalName).toBe(recorded().name);

      // 按码点计数：表情符号算一个字符；原扩展名的大小写保留
      await upload(`${'😀'.repeat(300)}.PNG`);
      expect(Array.from(recorded().name)).toHaveLength(255);
      expect(recorded().name.endsWith('😀.PNG')).toBe(true);

      // 原名没有扩展名：截断后以已校验的扩展名结尾
      await upload('b'.repeat(300));
      expect(recorded().name).toBe(`${'b'.repeat(251)}.png`);

      // 255 个字符以内原样保留
      const exact = `${'a'.repeat(251)}.png`;
      await upload(exact);
      expect(recorded().name).toBe(exact);
    });

    it('stores private uploads under the owner storage partition', async () => {
      const fileAssetService = {
        createFromBuffer: jest.fn(async (input: CreateFileAssetFromBufferInput) => ({
          fileId: 'file_abcdefghijklmnopqrstuvwx',
          name: input.name,
        })),
        createUniqueFileId: jest.fn().mockResolvedValue('file_abcdefghijklmnopqrstuvwx'),
        assertActorQuotaAvailable: jest.fn().mockResolvedValue(undefined),
        resolvePrivateObjectPartition: jest.fn().mockResolvedValue('users/stor_uploadpartition'),
        createRecord: jest.fn(async (input: any) => input),
        toFrontendFileAsset: jest.fn((record: any) => ({
          fileId: record.fileId,
          previewUrl: `/api/files/${record.fileId}/preview`,
        })),
      };
      const storageService = {
        resolveProviderName: jest.fn().mockResolvedValue('local'),
        putObject: jest.fn(async (_scope: string, input: any) => ({
          objectKey: input.objectKey,
          size: input.body.length,
          sha256: 'sha256-upload',
        })),
      };
      const uploadService = new UploadService(
        globalConfigService as any,
        redisCacheService as any,
        fileAssetService as any,
        storageService as any,
      );

      await uploadService.uploadFileAsset(
        {
          buffer: Buffer.from('%PDF-1.7\n'),
          mimetype: 'application/pdf',
          originalname: 'report.pdf',
          size: 8,
        },
        { user: { id: 7, role: 'user' } },
      );

      expect(fileAssetService.createFromBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          visitorId: null,
          name: 'report.pdf',
          buffer: Buffer.from('%PDF-1.7\n'),
          visibility: 'private',
        }),
      );
      expect(storageService.putObject).not.toHaveBeenCalled();
      expect(fileAssetService.createRecord).not.toHaveBeenCalled();
    });

    it('stores decoded original names for mojibake Chinese uploads', async () => {
      const fileAssetService = {
        createFromBuffer: jest.fn(async (input: CreateFileAssetFromBufferInput) => ({
          fileId: 'file_abcdefghijklmnopqrstuvwx',
          name: input.name,
        })),
        createUniqueFileId: jest.fn().mockResolvedValue('file_abcdefghijklmnopqrstuvwx'),
        assertActorQuotaAvailable: jest.fn().mockResolvedValue(undefined),
        resolvePrivateObjectPartition: jest.fn().mockResolvedValue('users/stor_uploadpartition'),
        createRecord: jest.fn(async (input: any) => input),
        toFrontendFileAsset: jest.fn((record: any) => ({
          fileId: record.fileId,
          name: record.name,
        })),
      };
      const storageService = {
        resolveProviderName: jest.fn().mockResolvedValue('local'),
        putObject: jest.fn(async (_scope: string, input: any) => ({
          objectKey: input.objectKey,
          size: input.body.length,
          sha256: 'sha256-upload',
        })),
      };
      const uploadService = new UploadService(
        globalConfigService as any,
        redisCacheService as any,
        fileAssetService as any,
        storageService as any,
      );

      const result = await uploadService.uploadFileAsset(
        {
          buffer: Buffer.from('hello'),
          mimetype: 'text/plain',
          originalname: Buffer.from('计费说明.txt', 'utf8').toString('latin1'),
          size: 5,
        },
        { user: { id: 7, role: 'user' } },
      );

      expect(fileAssetService.createFromBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '计费说明.txt',
        }),
      );
      expect(result).toMatchObject({ name: '计费说明.txt' });

      // 私有上传不在这里截断：长名称原样交给 createFromBuffer（它按字节截断并保留扩展名）
      const longName = `${'😀'.repeat(300)}report.txt`;
      await uploadService.uploadFileAsset(
        { buffer: Buffer.from('hello'), mimetype: 'text/plain', originalname: longName, size: 5 },
        { user: { id: 7, role: 'user' } },
      );
      expect(fileAssetService.createFromBuffer).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: longName }),
      );
    });
  });
});
