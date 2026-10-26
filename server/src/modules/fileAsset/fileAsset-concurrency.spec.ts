import { createFileAssetMemoryFixture } from '../../test/fixtures/file-asset-memory.fixture';
import { FileAssetService } from './fileAsset.service';
import type { FileAssetStorageService } from './fileAsset-storage.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

function barrier() {
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  return { ready, release };
}
const input = {
  userId: 7,
  messageId: 'message_race',
  name: 'result.txt',
  buffer: Buffer.from('synthetic result'),
  purpose: 'tool_output' as const,
  delivery: { turnId: 'race', sourceKey: 'result.txt' },
};

describe('private file lifecycle account locking', () => {
  it('rechecks a stale cleanup candidate after another service retries the delivery', async () => {
    const f = createFileAssetMemoryFixture();
    const second = new FileAssetService(f.repository as any, f.storage as any);
    f.storage.putObject.mockRejectedValueOnce(new Error('write unavailable'));
    f.storage.deleteObject.mockRejectedValueOnce(new Error('delete unavailable'));
    await expect(f.files.createFromBuffer(input)).rejects.toThrow('write unavailable');
    const failed = structuredClone([...f.rows.values()][0]);
    expect(failed.status).toBe('failed');
    const selected = barrier();
    const continueScan = barrier();
    const originalQuery = f.repository.createQueryBuilder;
    let intercept = true;
    jest.spyOn(f.repository, 'createQueryBuilder').mockImplementation(() => {
      const query = originalQuery();
      if (intercept) {
        intercept = false;
        query.getMany = async () => {
          selected.release();
          await continueScan.ready;
          return [failed];
        };
      }
      return query;
    });
    const cleanup = second.cleanupExpiredFiles();
    await selected.ready;
    const writing = barrier();
    const finishWrite = barrier();
    const put = f.storage.putObject.getMockImplementation();
    f.storage.putObject.mockImplementationOnce(
      async (...args: Parameters<FileAssetStorageService['putObject']>) => {
        writing.release();
        await finishWrite.ready;
        return put(...args);
      },
    );
    const retry = f.files.createFromBuffer(input);
    await writing.ready;
    continueScan.release();
    finishWrite.release();
    const saved = await retry;
    expect(await cleanup).toMatchObject({ contentDeleted: 0 });
    expect(f.rows.get(saved.fileId)!.status).toBe('active');
    expect(f.objects.get(failed.objectKey)).toEqual(input.buffer);
    await expect(second.findActiveForDownload(saved.fileId, { id: 7 })).resolves.toMatchObject({
      fileId: saved.fileId,
    });
  });

  it('serializes cross-session skill replacement and deletion, with no resurrected version', async () => {
    const f = createFileAssetMemoryFixture();
    const second = new FileAssetService(f.repository as any, f.storage as any);
    await f.files.saveSandboxSkill(7, 'sample', Buffer.from('version one'));
    const writing = barrier();
    const finishWrite = barrier();
    const put = f.storage.putObject.getMockImplementation();
    f.storage.putObject.mockImplementationOnce(
      async (...args: Parameters<FileAssetStorageService['putObject']>) => {
        writing.release();
        await finishWrite.ready;
        return put(...args);
      },
    );
    const save = f.files.saveSandboxSkill(7, 'sample', Buffer.from('version two'));
    await writing.ready;
    const remove = second.deleteSandboxSkill(7, 'sample');
    finishWrite.release();
    await save;
    await remove;
    expect(await second.listSandboxSkills(7)).toEqual([]);
    expect(f.objects.size).toBe(0);
    expect([...f.rows.values()].every(row => row.status === 'deleted')).toBe(true);
  });

  it('keeps failed deletion bytes charged until physical deletion succeeds', async () => {
    const f = createFileAssetMemoryFixture();
    const files = new FileAssetService(f.repository as any, f.storage as any, undefined, {
      getConfigs: async () => ({ fileAssetUserQuotaMb: 1 }),
    } as any);
    const saved = await files.createFromBuffer({ ...input, buffer: Buffer.alloc(700 * 1024) });
    f.storage.deleteObject.mockRejectedValueOnce(new Error('delete unavailable'));
    await expect(files.deleteOwnedFile(saved.fileId, 7)).rejects.toThrow('清理暂未完成');
    expect(f.rows.get(saved.fileId)!.status).toBe('failed');
    await expect(
      files.createFromBuffer({ ...input, delivery: undefined, buffer: Buffer.alloc(400 * 1024) }),
    ).rejects.toThrow('上限');
    await files.cleanupExpiredFiles();
    expect(f.rows.get(saved.fileId)!.status).toBe('deleted');
    await expect(
      files.createFromBuffer({ ...input, delivery: undefined, buffer: Buffer.alloc(400 * 1024) }),
    ).resolves.toHaveProperty('fileId');
  });
});
