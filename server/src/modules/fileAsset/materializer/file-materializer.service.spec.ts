import { BadRequestException, ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import { Readable } from 'stream';
import { FileMaterializerService, MODEL_IMAGE_MAX_BYTES } from './file-materializer.service';
import { resolveFileSource, resolveLocalPublicFilePath } from './file-source-resolver';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const fileId = 'file_abcdefghijklmnopqrstuvwx';
const pngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

describe('FileMaterializerService', () => {
  let fileAssetService: {
    findActiveForPreview: any;
    findActiveForDownload: any;
  };
  let storageService: {
    getObjectStat: any;
    getObjectStream: any;
    createSignedReadUrl: any;
  };
  let service: FileMaterializerService;

  beforeEach(() => {
    fileAssetService = {
      findActiveForPreview: jest.fn().mockResolvedValue({
        fileId,
        ownerType: 'user',
        ownerId: 1,
        bucket: 'private',
        objectKey: 'users/stor_secret/private.png',
        storageProvider: 'local',
        storageScope: 'private',
        size: pngBuffer.length,
        mime: 'image/png',
      }),
      findActiveForDownload: jest.fn().mockResolvedValue({
        fileId,
        ownerType: 'user',
        ownerId: 1,
        bucket: 'private',
        objectKey: 'users/stor_secret/private.png',
        storageProvider: 'local',
        storageScope: 'private',
        size: pngBuffer.length,
        mime: 'image/png',
        name: 'private.png',
      }),
    };
    storageService = {
      getObjectStat: jest.fn().mockResolvedValue({
        exists: true,
        size: pngBuffer.length,
        mime: 'image/png',
        lastModified: new Date(),
      }),
      getObjectStream: jest.fn().mockResolvedValue({
        stream: Readable.from([pngBuffer]),
        size: pngBuffer.length,
        mime: 'image/png',
      }),
      createSignedReadUrl: jest.fn(),
    };
    service = new FileMaterializerService(fileAssetService as any, storageService as any);
  });

  it('reads an internal /api/files preview through FileAsset instead of signed URL or HTTP self request', async () => {
    const result = await service.materializeImageForModel({
      source: `/api/files/${fileId}/preview`,
      actor: { id: 1, role: 'user' },
    });

    expect(result).toMatchObject({
      mime: 'image/png',
      size: pngBuffer.length,
      sourceType: 'internal_file_url',
    });
    expect(result.dataUrl).toContain('data:image/png;base64,');
    expect(fileAssetService.findActiveForPreview).toHaveBeenCalledWith(fileId, {
      id: 1,
      role: 'user',
    });
    expect(storageService.getObjectStream).toHaveBeenCalledWith(
      'private',
      {
        bucket: 'private',
        objectKey: 'users/stor_secret/private.png',
      },
      'local',
    );
    expect(storageService.createSignedReadUrl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('stor_secret');
    expect(JSON.stringify(result)).not.toContain('objectKey');
  });

  it('materializes a direct fileId with owner checks', async () => {
    await service.materializeImageForModel({
      source: fileId,
      actor: { id: 1, role: 'user' },
    });

    expect(fileAssetService.findActiveForPreview).toHaveBeenCalledWith(fileId, {
      id: 1,
      role: 'user',
    });
  });

  it('rejects owner check failures from FileAssetService', async () => {
    fileAssetService.findActiveForPreview.mockRejectedValueOnce(
      new ForbiddenException('无权访问该文件'),
    );

    await expect(
      service.materializeImageForModel({
        source: fileId,
        actor: { id: 2, role: 'user' },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts valid image data URLs with size and mime checks', async () => {
    const result = await service.materializeImageForModel({
      source: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      actor: { id: 1, role: 'user' },
    });

    expect(result).toMatchObject({
      mime: 'image/png',
      size: pngBuffer.length,
      sourceType: 'data_url',
    });
    expect(fileAssetService.findActiveForPreview).not.toHaveBeenCalled();
  });

  it('materializes generic data URLs for service buffers with mime and size checks', async () => {
    const result = await service.materializeFileForService({
      source: `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`,
      actor: { id: 1, role: 'user' },
      maxBytes: 32,
    });

    expect(result).toMatchObject({
      name: 'data-url-file',
      mime: 'text/plain',
      size: 5,
      sourceType: 'data_url',
    });
    expect(result.buffer.toString()).toBe('hello');
    expect(fileAssetService.findActiveForDownload).not.toHaveBeenCalled();
  });

  it('rejects malformed or oversized generic data URLs before service buffering', async () => {
    await expect(
      service.materializeFileForService({
        source: 'data:text/plain;base64,not-valid-base64',
        actor: { id: 1, role: 'user' },
        maxBytes: 32,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.materializeFileForService({
        source: `data:text/plain;base64,${Buffer.alloc(33, 1).toString('base64')}`,
        actor: { id: 1, role: 'user' },
        maxBytes: 32,
      }),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('rejects invalid or non-image data URLs', async () => {
    await expect(
      service.materializeImageForModel({
        source: 'data:text/plain;base64,SGVsbG8=',
        actor: { id: 1, role: 'user' },
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.materializeImageForModel({
        source: 'data:image/png;base64,not-valid-base64',
        actor: { id: 1, role: 'user' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects oversized FileAsset objects before streaming content', async () => {
    fileAssetService.findActiveForPreview.mockResolvedValueOnce({
      fileId,
      ownerType: 'user',
      ownerId: 1,
      bucket: 'private',
      objectKey: 'users/stor_secret/large.png',
      storageProvider: 'local',
      storageScope: 'private',
      size: MODEL_IMAGE_MAX_BYTES + 1,
      mime: 'image/png',
    });

    await expect(
      service.materializeImageForModel({
        source: fileId,
        actor: { id: 1, role: 'user' },
      }),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(storageService.getObjectStream).not.toHaveBeenCalled();
  });
});

describe('file-source-resolver', () => {
  it('only treats absolute /api/files urls as internal when host matches siteUrl', () => {
    const trusted = resolveFileSource(`https://app.example.com/api/files/${fileId}/preview`, {
      siteUrl: 'https://app.example.com',
    });
    const untrusted = resolveFileSource(`https://evil.example.com/api/files/${fileId}/preview`, {
      siteUrl: 'https://app.example.com',
    });

    expect(trusted).toMatchObject({
      kind: 'internal_file_url',
      fileId,
    });
    expect(untrusted).toMatchObject({
      kind: 'external_url',
    });
    expect(untrusted.fileId).toBeUndefined();
  });

  it('resolves public files under the configured public local root', () => {
    const resolved = resolveLocalPublicFilePath('/file/dev/test.png', '/tmp/public-file-root');

    expect(resolved).toBe('/tmp/public-file-root/dev/test.png');
  });
});
