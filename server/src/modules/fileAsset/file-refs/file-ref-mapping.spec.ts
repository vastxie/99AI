import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { FileAssetEntity } from '../fileAsset.entity';
import { FileRefMappingStore, normalizeFileRefMapping } from './file-ref-mapping';
import { resolveFileRef } from './file-ref-resolver';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('FileRefMapping', () => {
  const imageFileId = 'file_aaaaaaaaaaaaaaaaaaaaaaaa';
  const documentFileId = 'file_bbbbbbbbbbbbbbbbbbbbbbbb';

  it('allocates stable fileRef values for files in the same context', () => {
    const store = new FileRefMappingStore();
    const first = store.registerFile(imageFileId, {
      origin: 'user_upload',
      name: 'cat.png',
      mime: 'image/png',
      type: 'image',
      role: 'source',
    });
    const second = store.registerFile(imageFileId, {
      origin: 'user_upload',
      name: 'changed.png',
    });

    expect(first.fileRef).toBe('attachment_1');
    expect(second.fileRef).toBe('attachment_1');
    expect(store.entries).toHaveLength(1);
    expect(store.snapshot().entries[0]).toMatchObject({
      fileRef: 'attachment_1',
      fileId: imageFileId,
      name: 'cat.png',
      mime: 'image/png',
      role: 'source',
    });
  });

  it('uses separate counters for attachment, output image, output file, and history refs', () => {
    const store = new FileRefMappingStore();

    expect(store.registerFile(imageFileId, { origin: 'user_upload' }).fileRef).toBe('attachment_1');
    expect(
      store.registerFile('file_cccccccccccccccccccccccc', {
        origin: 'tool_output',
        mime: 'image/webp',
      }).fileRef,
    ).toBe('output_image_1');
    expect(
      store.registerFile(documentFileId, {
        origin: 'tool_output',
        mime: 'application/pdf',
      }).fileRef,
    ).toBe('output_file_1');
    expect(
      store.registerFile('file_dddddddddddddddddddddddd', {
        origin: 'history',
      }).fileRef,
    ).toBe('previous_file_1');
  });

  it('normalizes persisted mappings and continues counters from existing refs', () => {
    const mapping = normalizeFileRefMapping({
      entries: [
        {
          fileRef: 'output_file_3',
          fileId: documentFileId,
          name: 'report.pdf',
        },
      ],
      counters: {
        attachment: 9,
        output_image: 0,
        output_file: 1,
        previous_file: 0,
      },
    });
    const store = new FileRefMappingStore(mapping);

    expect(store.registerFile('file_eeeeeeeeeeeeeeeeeeeeeeee').fileRef).toBe('output_file_4');
    expect(
      store.registerFile('file_ffffffffffffffffffffffff', { origin: 'user_upload' }).fileRef,
    ).toBe('attachment_10');
  });

  it('rejects malformed fileId and fileRef values', () => {
    expect(() => new FileRefMappingStore().registerFile('file_../secret')).toThrow(
      BadRequestException,
    );
    expect(
      () =>
        new FileRefMappingStore({
          entries: [{ fileRef: 'file_1', fileId: imageFileId }],
        }),
    ).toThrow(BadRequestException);
  });
});

describe('resolveFileRef', () => {
  const fileId = 'file_gggggggggggggggggggggggg';
  let fileAssetService: any;
  let resolver: { resolveFileRef: (input: any) => Promise<any> };
  let file: FileAssetEntity;

  beforeEach(() => {
    file = {
      fileId,
      userId: 7,
      visitorId: null,
      storageScope: 'private',
      visibility: 'private',
      status: 'active',
      allowPreview: true,
      allowDownload: true,
    } as unknown as FileAssetEntity;
    fileAssetService = {
      findByFileIdForAccess: jest.fn().mockResolvedValue(file),
      assertAccessible: jest.fn(),
    };
    resolver = { resolveFileRef: input => resolveFileRef(fileAssetService, input) };
  });

  it('resolves fileRef through the mapping before returning an internal fileId', async () => {
    const store = new FileRefMappingStore();
    const entry = store.registerFile(fileId, {
      origin: 'user_upload',
      name: 'source.png',
      mime: 'image/png',
    });

    const resolved = await resolver.resolveFileRef({
      fileRef: entry.fileRef,
      mapping: store,
      actor: { id: 7, role: 'user' },
    });

    expect(resolved.fileId).toBe(fileId);
    expect(resolved.entry).toMatchObject({ fileRef: 'attachment_1', name: 'source.png' });
    expect(fileAssetService.findByFileIdForAccess).toHaveBeenCalledWith(fileId);
    expect(fileAssetService.assertAccessible).toHaveBeenCalledWith(file, { id: 7, role: 'user' });
  });

  it('does not treat fileRef as a credential outside the current mapping', async () => {
    await expect(
      resolver.resolveFileRef({
        fileRef: 'attachment_1',
        mapping: null,
        actor: { id: 7, role: 'user' },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fileAssetService.findByFileIdForAccess).not.toHaveBeenCalled();
  });

  it('propagates FileAsset owner and status checks', async () => {
    const store = new FileRefMappingStore();
    const entry = store.registerFile(fileId, { origin: 'tool_output' });
    fileAssetService.assertAccessible.mockImplementation(() => {
      throw new ForbiddenException('无权访问该文件。');
    });

    await expect(
      resolver.resolveFileRef({
        fileRef: entry.fileRef,
        mapping: store.snapshot(),
        actor: { id: 8, role: 'user' },
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
