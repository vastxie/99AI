import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { createFileId, createStorageId } from '@/common/utils';
import { createFileAssetMemoryFixture } from '../../test/fixtures/file-asset-memory.fixture';
import { createMockQueryBuilder, createMockRepository } from '../../test/mocks/repository.mock';
import { FileAssetEntity } from './fileAsset.entity';
import { FileAssetService } from './fileAsset.service';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('FileAssetService foundation', () => {
  let repository: any;
  let service: FileAssetService;

  beforeEach(() => {
    repository = createMockRepository(jest.fn);
    repository.createQueryBuilder.mockReturnValue(createMockQueryBuilder({ rawOne: { total: 0 } }));
    repository.manager = {
      dataSource: {
        createQueryRunner: () => ({
          manager: { getRepository: () => repository },
          connect: async () => {},
          query: async () => [{ acquired: 1 }],
          release: async () => {},
        }),
      },
    };
    service = new FileAssetService(repository as any);
  });

  function createFile(overrides: Partial<FileAssetEntity> = {}): FileAssetEntity {
    return {
      fileId: 'file_owned',
      userId: 7,
      visitorId: null,
      name: 'report.pdf',
      mime: 'application/pdf',
      size: 1024,
      category: 'file',
      purpose: 'chat_file',
      storageScope: 'private',
      storageProvider: 'local',
      visibility: 'private',
      status: 'active',
      allowPreview: true,
      allowDownload: true,
      expiresAt: null,
      ...overrides,
    } as FileAssetEntity;
  }

  it.each([
    [undefined, false],
    ['private-assets', false],
    ['private-assets', true],
  ])(
    'deletes stored content after the lifecycle transaction with bucket %s and retry %s',
    async (bucket: string | undefined, retry: boolean) => {
      const f = createFileAssetMemoryFixture();
      const saved = await f.files.createFromBuffer({
        userId: 7,
        name: 'cleanup.txt',
        buffer: Buffer.from('synthetic cleanup content'),
      });
      const row = f.rows.get(saved.fileId)!;
      Object.assign(row, { id: 1, bucket });
      const objectKey = row.objectKey;
      const findOne = jest.fn(async () => {
        const { bucket: _bucket, objectKey: _objectKey, ...visible } = f.rows.get(saved.fileId)!;
        const entity = Object.assign(new FileAssetEntity(), visible);
        expect(Object.hasOwn(entity, 'objectKey')).toBe(true);
        expect(entity.objectKey).toBeUndefined();
        return entity;
      });
      Object.assign(f.repository.manager, {
        transaction: async (work: (manager: any) => Promise<void>) =>
          work({
            findOne,
            save: async (_entity: unknown, value: FileAssetEntity) => f.repository.save(value),
          }),
      });

      if (retry) {
        f.storage.deleteObject.mockRejectedValueOnce(new Error('synthetic storage failure'));
        await expect(
          f.files.batchDeleteFiles([saved.fileId], { id: 7, role: 'super' }),
        ).resolves.toMatchObject({ contentDeleted: 0, missingContent: 0, cleanupPending: 1 });
        expect(f.rows.get(saved.fileId)).toMatchObject({ status: 'failed', objectKey });
        expect(f.objects.size).toBe(1);
      }
      const result = await f.files.batchDeleteFiles([saved.fileId], { id: 7, role: 'super' });

      expect(result).toMatchObject({ contentDeleted: 1, missingContent: 0, cleanupPending: 0 });
      expect(findOne).toHaveBeenCalledWith(FileAssetEntity, {
        where: { id: 1 },
        lock: { mode: 'pessimistic_write' },
      });
      expect(f.storage.deleteObject).toHaveBeenCalledWith(
        'private',
        { bucket, objectKey },
        'local',
      );
      expect(f.objects.size).toBe(0);
      expect(f.rows.get(saved.fileId)).toMatchObject({ status: 'deleted', objectKey });
    },
  );

  it('generates random-looking fileId and storageId values', () => {
    const fileIds = Array.from({ length: 24 }, () => createFileId());
    const storageIds = Array.from({ length: 24 }, () => createStorageId());

    expect(new Set(fileIds).size).toBe(fileIds.length);
    expect(new Set(storageIds).size).toBe(storageIds.length);
    expect(fileIds.every(id => /^file_[0-9A-Za-z]{24}$/.test(id))).toBe(true);
    expect(storageIds.every(id => /^stor_[0-9A-Za-z]{18}$/.test(id))).toBe(true);
    expect(fileIds).not.toContain('file_000000000000000000000000');
    expect(storageIds).not.toContain('stor_000000000000000000');
  });

  it('retries when a generated fileId already exists', async () => {
    repository.findOne.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

    await expect(service.createUniqueFileId()).resolves.toMatch(/^file_[0-9A-Za-z]{24}$/);
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });

  it('does not project internal storage fields to frontend payloads', () => {
    const file = createFile({
      fileId: 'file_safe',
      storageScope: 'private',
      visibility: 'private',
      storageProvider: 'objstore',
      bucket: 'private-bucket',
      objectKey: 'users/stor_secret/files/file_safe.pdf',
    } as Partial<FileAssetEntity>);

    const projection = service.toFrontendFileAsset(file);
    const serialized = JSON.stringify(projection);

    expect(projection).toEqual({
      fileId: 'file_safe',
      name: 'report.pdf',
      mime: 'application/pdf',
      size: 1024,
      category: 'file',
      purpose: 'chat_file',
      visibility: 'private',
      previewUrl: '/api/files/file_safe/preview',
      downloadUrl: '/api/files/file_safe/download',
    });
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('storageProvider');
    expect(serialized).not.toContain('private-bucket');
    expect(serialized).not.toContain('stor_secret');
  });

  it('projects public files with stable public access url only', () => {
    const file = createFile({
      fileId: 'file_public_safe',
      storageScope: 'public',
      visibility: 'public',
      objectKey: 'public/202605/file_public_safe.png',
    } as Partial<FileAssetEntity>);

    const projection = service.toFrontendFileAsset(file);

    expect(projection.publicUrl).toBe('/api/files/public/file_public_safe/preview');
    expect(JSON.stringify(projection)).not.toContain('objectKey');
    expect(JSON.stringify(projection)).not.toContain('public/202605');
  });

  it('rejects non-owner private file access', () => {
    const file = createFile({ userId: 7 });

    expect(() => service.assertAccessible(file, { id: 8, role: 'viewer' })).toThrow(
      ForbiddenException,
    );
  });

  it('does not let public visibility bypass owner when storage is still private', () => {
    const file = createFile({
      userId: 7,
      storageScope: 'private',
      visibility: 'public',
    } as Partial<FileAssetEntity>);

    expect(() => service.assertAccessible(file, { id: 8, role: 'viewer' })).toThrow(
      ForbiddenException,
    );
  });

  it('allows owner bypass only for files that are both public visibility and public storage', () => {
    const file = createFile({
      userId: 7,
      storageScope: 'public',
      visibility: 'public',
    } as Partial<FileAssetEntity>);

    expect(() => service.assertAccessible(file, { id: 8, role: 'viewer' })).not.toThrow();
  });

  it('rejects normal admin access to another user private file', () => {
    const file = createFile({ userId: 7 });

    expect(() => service.assertAccessible(file, { id: 8, role: 'admin' })).toThrow(
      ForbiddenException,
    );
  });

  it('logs super access to private files without leaking storage internals', () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const file = createFile({
      fileId: 'file_super_access',
      userId: 7,
      storageProvider: 'objstore',
      bucket: 'private-bucket',
      objectKey: 'users/stor_secret/files/file_super_access.pdf',
    } as Partial<FileAssetEntity>);

    expect(() => service.assertAccessible(file, { id: 1, role: 'super' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('file_super_access'),
      'FileAssetService',
    );

    const serializedLog = JSON.stringify(warnSpy.mock.calls);
    expect(serializedLog).not.toContain('stor_secret');
    expect(serializedLog).not.toContain('users/stor_secret');
    expect(serializedLog).not.toContain('objectKey');
    expect(serializedLog).not.toContain('bucket');
    expect(serializedLog).not.toContain('private-bucket');
    expect(serializedLog).not.toContain('storageProvider');

    warnSpy.mockRestore();
  });

  it('rejects deleted expired and inactive files', () => {
    for (const status of ['deleted', 'expired', 'inactive'] as const) {
      const file = createFile({ status });
      expect(() => service.assertAccessible(file, { id: 7, role: 'viewer' })).toThrow(
        GoneException,
      );
    }

    const expiredByTime = createFile({ expiresAt: new Date(Date.now() - 1000) });
    expect(() => service.assertAccessible(expiredByTime, { id: 7, role: 'viewer' })).toThrow(
      GoneException,
    );
    expect(expiredByTime.status).toBe('expired');
  });

  it('honors allowPreview and allowDownload gates', () => {
    const previewBlocked = createFile({ allowPreview: false });
    const downloadBlocked = createFile({ allowDownload: false });

    expect(() => service.assertPreviewAllowed(previewBlocked, { id: 7 })).toThrow(
      ForbiddenException,
    );
    expect(() => service.assertDownloadAllowed(downloadBlocked, { id: 7 })).toThrow(
      ForbiddenException,
    );
  });

  it.each([
    ['text/plain', 'note.txt', true],
    ['text/markdown', 'readme.md', true],
    ['text/csv', 'data.csv', true],
    ['application/json', 'result.json', true],
    ['application/pdf', 'report.pdf', true],
    ['image/png', 'image.png', true],
    ['text/html; charset=utf-8', 'page.html', false],
    ['application/xhtml+xml', 'page.xhtml', false],
    ['image/svg+xml', 'diagram.svg', false],
    ['application/octet-stream', 'unsafe.svg', false],
    ['application/javascript', 'script.js', false],
    ['text/css', 'style.css', false],
  ])(
    'sets safe default preview for runtime outputs: %s %s',
    async (mime: string, name: string, allowPreview: boolean) => {
      const storage = {
        resolveProviderName: jest.fn().mockResolvedValue('local'),
        putObject: jest.fn(async (_scope: string, input: any) => ({
          bucket: null as string | null,
          objectKey: input.objectKey,
          size: input.body.length,
          sha256: createHash('sha256').update(input.body).digest('hex'),
        })),
        deleteObject: jest.fn().mockResolvedValue(undefined),
      };
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((input: any) => input);
      repository.save.mockImplementation(async (input: any) => input);
      const serviceWithStorage = new FileAssetService(repository as any, storage as any);

      const projection = await serviceWithStorage.createFromBuffer({
        buffer: Buffer.from('runtime output'),
        name,
        mime,
        userId: 7,
      });

      const savedRecord = repository.save.mock.calls.at(-1)?.[0];
      expect(savedRecord.allowPreview).toBe(allowPreview);
      if (allowPreview) {
        expect(projection.previewUrl).toMatch(/^\/api\/files\/file_[0-9A-Za-z]{24}\/preview$/);
      } else {
        expect(projection.previewUrl).toBeUndefined();
      }
    },
  );

  it('deletes the stored private object when FileAsset record persistence fails', async () => {
    const storage = {
      resolveProviderName: jest.fn().mockResolvedValue('local'),
      putObject: jest.fn(async (_scope: string, input: any) => ({
        bucket: null as string | null,
        objectKey: input.objectKey,
        size: input.body.length,
        sha256: createHash('sha256').update(input.body).digest('hex'),
      })),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((input: any) => input);
    repository.save
      .mockImplementationOnce(async (input: any) => input)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockImplementationOnce(async (input: any) => input);
    const serviceWithStorage = new FileAssetService(repository as any, storage as any);

    await expect(
      serviceWithStorage.createFromBuffer({
        buffer: Buffer.from('data'),
        name: 'result.bin',
        userId: 7,
      }),
    ).rejects.toThrow('database unavailable');
    const storedObjectKey = storage.putObject.mock.calls[0][1].objectKey;
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'private',
      { bucket: undefined, objectKey: storedObjectKey },
      'local',
    );
  });

  it('does not write an object when the durable processing record cannot be created', async () => {
    const storage = {
      resolveProviderName: jest.fn().mockResolvedValue('local'),
      putObject: jest.fn(),
      deleteObject: jest.fn(),
    };
    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((input: any) => input);
    repository.save.mockRejectedValueOnce(new Error('database unavailable'));
    const serviceWithStorage = new FileAssetService(repository as any, storage as any);

    await expect(
      serviceWithStorage.createFromBuffer({
        buffer: Buffer.from('data'),
        name: 'result.bin',
        userId: 7,
      }),
    ).rejects.toThrow('database unavailable');
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('keeps a durable failed cleanup row when activation and object deletion both fail', async () => {
    const snapshots: any[] = [];
    const storage = {
      resolveProviderName: jest.fn().mockResolvedValue('objstore'),
      putObject: jest.fn(async (_scope: string, input: any) => ({
        bucket: 'private-assets',
        objectKey: input.objectKey,
        size: input.body.length,
        sha256: createHash('sha256').update(input.body).digest('hex'),
      })),
      deleteObject: jest.fn().mockRejectedValue(new Error('object storage unavailable')),
    };
    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((input: any) => input);
    repository.save
      .mockImplementationOnce(async (input: any) => {
        snapshots.push(structuredClone(input));
        return input;
      })
      .mockRejectedValueOnce(new Error('activation failed'))
      .mockImplementation(async (input: any) => {
        snapshots.push(structuredClone(input));
        return input;
      });
    const serviceWithStorage = new FileAssetService(repository as any, storage as any);

    await expect(
      serviceWithStorage.createFromBuffer({
        buffer: Buffer.from('data'),
        name: 'result.bin',
        userId: 7,
      }),
    ).rejects.toThrow('activation failed');
    expect(snapshots[0]).toMatchObject({
      status: 'processing',
      storageProvider: 'objstore',
      metadata: { fileContentLifecycle: 'object_write_pending' },
    });
    expect(snapshots.at(-1)).toMatchObject({
      status: 'failed',
      storageProvider: 'objstore',
      metadata: {
        fileContentLifecycle: 'cleanup_pending',
        fileContentCleanupTarget: 'create_failed',
        fileContentCleanupResult: 'failed',
      },
    });
    expect(snapshots.at(-1).objectKey).toBe(snapshots[0].objectKey);
    expect(JSON.stringify(snapshots.at(-1))).not.toContain('private-assets-secret');
  });

  it('keeps failed deletes retryable and finalizes only after physical deletion succeeds', async () => {
    const pending = createFile({
      fileId: 'file_abcdefghijklmnopqrstuvwx',
      userId: 7,
      objectKey: 'users/stor/private/file_abcdefghijklmnopqrstuvwx.txt',
      metadata: {},
    } as Partial<FileAssetEntity>);
    const storage = {
      deleteObject: jest
        .fn()
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const snapshots: any[] = [];
    repository.createQueryBuilder.mockReturnValue(createMockQueryBuilder({ one: pending }));
    repository.save.mockImplementation(async (input: any) => {
      snapshots.push(structuredClone(input));
      return input;
    });
    const serviceWithStorage = new FileAssetService(repository as any, storage as any);

    await expect(serviceWithStorage.deleteOwnedFile(pending.fileId, 7)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(snapshots.at(-1)).toMatchObject({
      status: 'failed',
      metadata: {
        fileContentCleanupTarget: 'user_deleted',
        fileContentCleanupResult: 'failed',
      },
    });
    expect(snapshots.some(item => item.status === 'deleted')).toBe(false);

    repository.createQueryBuilder.mockReturnValueOnce(createMockQueryBuilder({ many: [pending] }));
    const retry = await serviceWithStorage.cleanupExpiredFiles(new Date());
    expect(retry).toMatchObject({ scanned: 1, contentDeleted: 1, cleanupPending: 0 });
    expect(snapshots.at(-1)).toMatchObject({
      status: 'deleted',
      metadata: {
        fileContentCleanupTarget: 'user_deleted',
        fileContentCleanupResult: 'user_deleted',
      },
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['ENOENT code', Object.assign(new Error('missing'), { code: 'ENOENT' })],
    ['NoSuchKey code', Object.assign(new Error('missing'), { code: 'NoSuchKey' })],
    ['404 status', Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } })],
  ])(
    'finalizes a stale processing row when the object never existed (%s)',
    async (_label: string, cause: Error) => {
      const stale = createFile({
        fileId: 'file_stalestalestalestale01',
        userId: 7,
        status: 'processing',
        objectKey: 'users/stor/private/file_stalestalestalestale01.bin',
        metadata: { fileContentLifecycle: 'object_write_pending' },
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      } as Partial<FileAssetEntity>);
      const storage = { deleteObject: jest.fn().mockRejectedValue(cause) };
      repository.createQueryBuilder.mockReturnValueOnce(createMockQueryBuilder({ many: [stale] }));
      repository.createQueryBuilder.mockReturnValue(createMockQueryBuilder({ one: stale }));
      repository.save.mockImplementation(async (input: any) => input);
      const serviceWithStorage = new FileAssetService(repository as any, storage as any);

      await expect(serviceWithStorage.cleanupExpiredFiles(new Date())).resolves.toMatchObject({
        scanned: 1,
        contentDeleted: 1,
        cleanupPending: 0,
      });
      expect(stale.status).toBe('deleted');
      expect(stale.metadata).toMatchObject({
        fileContentLifecycle: 'deleted',
        fileContentCleanupResult: 'missing',
      });
    },
  );

  it('retains a processing row when the post-delete status update fails and retries idempotently', async () => {
    const source = createFile({
      fileId: 'file_zyxwvutsrqponmlkjihgfedc',
      userId: 7,
      objectKey: 'users/stor/private/file_zyxwvutsrqponmlkjihgfedc.txt',
      metadata: {},
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    } as Partial<FileAssetEntity>);
    const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    const persistedSnapshots: any[] = [];
    repository.createQueryBuilder.mockReturnValue(createMockQueryBuilder({ one: source }));
    repository.save
      .mockImplementationOnce(async (input: any) => {
        persistedSnapshots.push(structuredClone(input));
        return input;
      })
      .mockRejectedValueOnce(new Error('status update unavailable'));
    const serviceWithStorage = new FileAssetService(repository as any, storage as any);

    await expect(serviceWithStorage.deleteOwnedFile(source.fileId, 7)).rejects.toThrow(
      'status update unavailable',
    );
    expect(persistedSnapshots).toHaveLength(1);
    expect(persistedSnapshots[0]).toMatchObject({
      status: 'processing',
      metadata: { fileContentCleanupTarget: 'user_deleted' },
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);

    Object.assign(source, persistedSnapshots[0]);
    repository.createQueryBuilder.mockReturnValueOnce(createMockQueryBuilder({ many: [source] }));
    repository.save.mockImplementation(async (input: any) => input);
    await expect(serviceWithStorage.cleanupExpiredFiles(new Date())).resolves.toMatchObject({
      scanned: 1,
      contentDeleted: 1,
      cleanupPending: 0,
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(source.status).toBe('deleted');
  });

  it('stores runtime outputs under the owner storageId partition', async () => {
    const storage = {
      resolveProviderName: jest.fn().mockResolvedValue('local'),
      putObject: jest.fn(async (_scope: string, input: any) => ({
        bucket: null as string | null,
        objectKey: input.objectKey,
        size: input.body.length,
        sha256: createHash('sha256').update(input.body).digest('hex'),
      })),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 7, storageId: 'stor_owner1234567890' }),
      update: jest.fn(),
    };
    repository.findOne.mockResolvedValue(null);
    repository.create.mockImplementation((input: any) => input);
    repository.save.mockImplementation(async (input: any) => input);
    const serviceWithStorage = new FileAssetService(
      repository as any,
      storage as any,
      userRepository as any,
    );

    await serviceWithStorage.createFromBuffer({
      buffer: Buffer.from('runtime output'),
      name: 'result.txt',
      mime: 'text/plain',
      userId: 7,
    });

    expect(storage.putObject).toHaveBeenCalledWith(
      'private',
      expect.objectContaining({
        objectKey: expect.stringMatching(
          /^users\/stor_owner1234567890\/tools\/\d{6}\/file_[0-9A-Za-z]{24}\.txt$/,
        ),
      }),
      'local',
    );
  });

  it('rejects deleting another user file even when it is publicly accessible', async () => {
    const sourceFile = createFile({
      fileId: 'file_publicabcdefghijklmnopqr',
      userId: 8,
      storageScope: 'public',
      visibility: 'public',
      objectKey: 'public/file_publicabcdefghijklmnopqr.txt',
    } as Partial<FileAssetEntity>);
    const storage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    repository.createQueryBuilder.mockReturnValue(createMockQueryBuilder({ one: sourceFile }));
    const serviceWithStorage = new FileAssetService(repository as any, storage as any);

    await expect(serviceWithStorage.deleteOwnedFile(sourceFile.fileId, 7)).rejects.toThrow(
      '无权删除该文件。',
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('allows public access only for active public storage files', () => {
    const publicFile = createFile({ storageScope: 'public', visibility: 'public' });
    const privateFile = createFile({ storageScope: 'private', visibility: 'private' });

    expect(() => service.assertPublicAccessible(publicFile)).not.toThrow();
    expect(() => service.assertPublicAccessible(privateFile)).toThrow();
  });

  it('rejects invalid clear filters instead of falling back to broad cleanup', async () => {
    const qb = createMockQueryBuilder({ many: [] });
    repository.createQueryBuilder.mockReturnValue(qb);

    await expect(
      service.clearFiles(
        {
          confirmText: 'CLEAR_FILE_ASSETS',
          filters: { status: 'all' },
          limit: 10,
        },
        { id: 1, role: 'super' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('applies configured private retention when expiresAt is not provided', async () => {
    repository.create.mockImplementation((input: any) => input);
    repository.save.mockImplementation(async (input: any) => input);
    const globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue({ fileAssetPrivateRetentionDays: 7 }),
    };
    const serviceWithConfig = new FileAssetService(
      repository as any,
      undefined,
      undefined,
      globalConfigService as any,
    );
    const before = Date.now();

    const record = await serviceWithConfig.createRecord({
      fileId: 'file_retention',
      storageScope: 'private',
      storageProvider: 'local',
      objectKey: 'users/stor/private/file_retention.txt',
      name: 'retention.txt',
      mime: 'text/plain',
      size: 12,
      sha256: 'sha256',
      category: 'file',
      purpose: 'chat_file',
      visibility: 'private',
    });

    expect(record.expiresAt).toBeInstanceOf(Date);
    expect(record.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000 - 1000,
    );
  });

  it('keeps private files when retention days is configured as zero', async () => {
    repository.create.mockImplementation((input: any) => input);
    repository.save.mockImplementation(async (input: any) => input);
    const serviceWithConfig = new FileAssetService(repository as any, undefined, undefined, {
      getConfigs: jest.fn().mockResolvedValue({ fileAssetPrivateRetentionDays: 0 }),
    } as any);

    const record = await serviceWithConfig.createRecord({
      fileId: 'file_no_retention',
      storageScope: 'private',
      storageProvider: 'local',
      objectKey: 'users/stor/private/file_no_retention.txt',
      name: 'retention.txt',
      mime: 'text/plain',
      size: 12,
      sha256: 'sha256',
      category: 'file',
      purpose: 'chat_file',
      visibility: 'private',
    });

    expect(record.expiresAt).toBeNull();
  });

  it('rejects user uploads when private file quota would be exceeded', async () => {
    repository.createQueryBuilder.mockReturnValue(
      createMockQueryBuilder({ rawOne: { total: 49 * 1024 * 1024 } }),
    );
    const serviceWithConfig = new FileAssetService(repository as any, undefined, undefined, {
      getConfigs: jest.fn().mockResolvedValue({ fileAssetUserQuotaMb: 50 }),
    } as any);

    await expect(
      serviceWithConfig.assertUserQuotaAvailable(7, 2 * 1024 * 1024),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses configured cleanup batch size for expired file cleanup', async () => {
    const take = jest.fn(() => qb);
    const qb = createMockQueryBuilder({
      many: [],
      overrides: { take },
    });
    repository.createQueryBuilder.mockReturnValue(qb);
    const serviceWithConfig = new FileAssetService(repository as any, undefined, undefined, {
      getConfigs: jest.fn().mockResolvedValue({ fileAssetCleanupBatchSize: 12 }),
    } as any);

    await serviceWithConfig.cleanupExpiredFiles(new Date());

    expect(take).toHaveBeenCalledWith(12);
  });
});

describe('FileAssetService avatar retention', () => {
  function setup(count: number, user: Record<string, unknown> | null) {
    const f = createFileAssetMemoryFixture();
    for (let id = 1; id <= count; id += 1) {
      const objectKey = `public/avatars/${id}.png`;
      f.rows.set(avatarFileId(id), {
        id,
        fileId: avatarFileId(id),
        userId: 7,
        purpose: 'avatar',
        storageScope: 'public',
        storageProvider: 'local',
        objectKey,
        status: 'active',
        metadata: {},
      });
      f.objects.set(objectKey, Buffer.from(`avatar ${id}`));
    }
    const users = { findOne: jest.fn(async () => user) };
    const service = new FileAssetService(f.repository as any, f.storage as any, users as any);
    return { ...f, service };
  }

  function avatarFileId(id: number) {
    return `file_avatar${String(id).padStart(13, '0')}`;
  }

  function activeIds(rows: Map<string, Record<string, any>>) {
    return [...rows.values()]
      .filter(row => row.status === 'active')
      .map(row => row.id)
      .sort((a, b) => b - a);
  }

  it('keeps the newest uploads and the avatars in use, deleting the rest across batches', async () => {
    // 230 条跨三批；列表查询若漏选 select: false 的存储列，文件会只被标删除而留在存储里
    const { service, rows, objects, storage } = setup(230, {
      id: 7,
      avatar: `/api/files/public/${avatarFileId(100)}/preview`,
      avatarFileId: avatarFileId(3),
    });

    await service.pruneAvatarUploads(7);

    const kept = [230, 229, 228, 227, 226, 100, 3];
    expect(activeIds(rows)).toEqual(kept);
    expect([...objects.keys()].sort()).toEqual(kept.map(id => `public/avatars/${id}.png`).sort());
    expect(storage.deleteObject).toHaveBeenCalledTimes(230 - kept.length);
    expect(rows.get(avatarFileId(1))).toMatchObject({ status: 'deleted' });
  });

  it('never fails the upload when cleanup breaks', async () => {
    const warn = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
    const { service, storage, repository } = setup(8, null);
    storage.deleteObject.mockRejectedValue(new Error('storage down'));
    await expect(service.pruneAvatarUploads(7)).resolves.toBeUndefined();
    jest.spyOn(repository, 'createQueryBuilder').mockImplementation(() => {
      throw new Error('database down');
    });
    await expect(service.pruneAvatarUploads(7)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('清理旧头像失败，下次上传头像时重试', 'FileAssetService');
    warn.mockRestore();
  });
});
