import { Logger } from '@nestjs/common';
import { createMockRepository } from '../../test/mocks/repository.mock';
import { FileAssetService } from './fileAsset.service';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('@/common/utils/safe-download.util', () => ({
  safeDownloadToBuffer: jest.fn(async () => ({
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    contentType: 'image/png',
  })),
}));

const recordInput = {
  fileId: 'file_abcdefghijklmnopqrstuvwx',
  storageScope: 'public' as const,
  storageProvider: 'demo_store',
  bucket: 'public-bucket',
  objectKey: 'avatars/202610/file_abcdefghijklmnopqrstuvwx.png',
  name: 'avatar.png',
  mime: 'image/png',
  size: 12,
  sha256: 'sha256-avatar',
  category: 'avatar' as const,
  purpose: 'avatar' as const,
  visibility: 'public' as const,
};

const createProviderStub = (name = 'demo_store') => ({
  name,
  putObject: jest.fn(async (input: any) => ({
    bucket: 'public-bucket',
    objectKey: input.objectKey,
    size: input.body.length,
    sha256: 'sha256-avatar',
  })),
  deleteObject: jest.fn(async (): Promise<void> => undefined),
});

/** 对象写入之后建档失败：先按 fileId 复查，再决定是否用写入时的同一个存储实例删除 */
describe('FileAssetService.createRecordOrDiscardObject', () => {
  let repository: any;
  let service: FileAssetService;
  let logs: string[];
  const saveError = new Error('save failed');

  beforeEach(() => {
    repository = createMockRepository(jest.fn);
    repository.create.mockImplementation((value: unknown) => value);
    repository.save.mockRejectedValue(saveError);
    service = new FileAssetService(repository as any);
    logs = [];
    jest.spyOn(Logger, 'error').mockImplementation((message: string) => {
      logs.push(message);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes the object when the record is confirmed absent and rethrows the original error', async () => {
    repository.findOne.mockResolvedValue(null);
    const provider = createProviderStub();

    await expect(service.createRecordOrDiscardObject(provider as any, recordInput)).rejects.toBe(
      saveError,
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { fileId: recordInput.fileId },
      select: { id: true },
      withDeleted: true,
    });
    expect(provider.deleteObject).toHaveBeenCalledWith({
      bucket: 'public-bucket',
      objectKey: recordInput.objectKey,
    });
  });

  it('keeps the object when the record was committed despite the error', async () => {
    repository.findOne.mockResolvedValue({ id: 9 });
    const provider = createProviderStub();

    await expect(service.createRecordOrDiscardObject(provider as any, recordInput)).rejects.toBe(
      saveError,
    );
    expect(provider.deleteObject).not.toHaveBeenCalled();
  });

  it('keeps the object when the recheck fails as well', async () => {
    repository.findOne.mockRejectedValue(new Error('recheck failed'));
    const provider = createProviderStub();

    await expect(service.createRecordOrDiscardObject(provider as any, recordInput)).rejects.toBe(
      saveError,
    );
    expect(provider.deleteObject).not.toHaveBeenCalled();
    expect(logs).toEqual(['建档报错后复查文件记录失败，保留已写入的对象']);
  });

  it('still rethrows the original error when deleting the object fails', async () => {
    repository.findOne.mockResolvedValue(null);
    const provider = createProviderStub();
    provider.deleteObject.mockRejectedValue(new Error('delete failed'));

    await expect(service.createRecordOrDiscardObject(provider as any, recordInput)).rejects.toBe(
      saveError,
    );
    expect(logs).toEqual(['删除未建档的对象失败，需要人工清理']);
  });

  it('returns the record and deletes nothing when the record is created', async () => {
    repository.save.mockImplementation(async (value: unknown) => value);
    const provider = createProviderStub();

    await expect(
      service.createRecordOrDiscardObject(provider as any, recordInput),
    ).resolves.toMatchObject({ fileId: recordInput.fileId });
    expect(repository.findOne).not.toHaveBeenCalled();
    expect(provider.deleteObject).not.toHaveBeenCalled();
  });

  it('transfers a third-party avatar and cleans up with the instance it wrote to', async () => {
    repository.findOne.mockResolvedValue(null);
    const written = createProviderStub('demo_store');
    const switched = createProviderStub('other_store');
    const storage = {
      createProvider: jest.fn().mockResolvedValueOnce(written).mockResolvedValue(switched),
    };
    service = new FileAssetService(repository as any, storage as any);
    jest.spyOn(service, 'createUniqueFileId').mockResolvedValue(recordInput.fileId);

    await expect(
      service.createAvatarFromUrl({ url: 'https://avatar.example.com/a.png', userId: 7 }),
    ).rejects.toBe(saveError);

    expect(storage.createProvider).toHaveBeenCalledTimes(1);
    expect(storage.createProvider).toHaveBeenCalledWith('public');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ storageProvider: 'demo_store', bucket: 'public-bucket' }),
    );
    expect(written.deleteObject).toHaveBeenCalledWith({
      bucket: 'public-bucket',
      objectKey: written.putObject.mock.calls[0][0].objectKey,
    });
    expect(switched.deleteObject).not.toHaveBeenCalled();
  });
});
