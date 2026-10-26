import { Readable, PassThrough } from 'stream';
import { FileAccessController } from './file-access.controller';
import { FileAssetEntity } from './fileAsset.entity';
import { IS_PUBLIC_KEY } from '@/common/auth/public.decorator';

declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('FileAccessController', () => {
  let controller: FileAccessController;
  let fileAssetService: any;
  let fileAssetStorageService: any;
  let globalConfigService: any;

  function createFile(overrides: Partial<FileAssetEntity> = {}): FileAssetEntity {
    return {
      fileId: 'file_access',
      userId: 7,
      visitorId: null,
      name: '测试文件.pdf',
      originalName: '测试文件.pdf',
      mime: 'application/pdf',
      size: 10,
      category: 'file',
      purpose: 'chat_file',
      storageScope: 'private',
      storageProvider: 'local',
      bucket: null,
      objectKey: 'users/random/report.pdf',
      visibility: 'private',
      status: 'active',
      allowPreview: true,
      allowDownload: true,
      expiresAt: null,
      ...overrides,
    } as FileAssetEntity;
  }

  function createResponse() {
    const res = new PassThrough() as any;
    const chunks: Buffer[] = [];
    const originalEnd = res.end.bind(res);
    res.headers = {};
    res.statusCode = 200;
    res.body = () => Buffer.concat(chunks).toString('utf8');
    res.setHeader = jest.fn((key: string, value: string) => {
      res.headers[key.toLowerCase()] = value;
      return res;
    });
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.redirect = jest.fn((code: number, url: string) => {
      res.statusCode = code;
      res.redirectUrl = url;
      return res;
    });
    res.end = jest.fn((...args: any[]) => originalEnd(...args));
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    return res;
  }

  beforeEach(() => {
    fileAssetService = {
      findByFileId: jest.fn(),
      findActiveForPreview: jest.fn(),
      findActiveForDownload: jest.fn(),
      findActivePublicForPreview: jest.fn(),
      findActivePublicForDownload: jest.fn(),
      assertAccessible: jest.fn(),
      toFrontendFileAsset: jest.fn((file: FileAssetEntity) => ({
        fileId: file.fileId,
        name: file.name,
        mime: file.mime,
        size: file.size,
        category: file.category,
        purpose: file.purpose,
        visibility: file.visibility,
        previewUrl: `/api/files/${file.fileId}/preview`,
        downloadUrl: `/api/files/${file.fileId}/download`,
      })),
      markAccessed: jest.fn().mockResolvedValue(undefined),
    };
    fileAssetStorageService = {
      getObjectStat: jest.fn(),
      getObjectStream: jest.fn(),
      createSignedReadUrl: jest.fn(),
    };
    globalConfigService = {
      getConfigs: jest.fn().mockResolvedValue(900),
    };
    controller = new FileAccessController(
      fileAssetService,
      fileAssetStorageService,
      globalConfigService,
    );
  });

  it('returns safe file meta without storage fields', async () => {
    const file = createFile();
    fileAssetService.findByFileId.mockResolvedValue(file);

    const result = await controller.meta('file_access', {
      user: { id: 7, role: 'user' },
    } as any);

    expect(result).toMatchObject({
      fileId: 'file_access',
      previewUrl: '/api/files/file_access/preview',
      downloadUrl: '/api/files/file_access/download',
    });
    expect(JSON.stringify(result)).not.toContain('objectKey');
    expect(JSON.stringify(result)).not.toContain('bucket');
  });

  it('streams local private download with safe headers', async () => {
    const file = createFile();
    const res = createResponse();
    fileAssetService.findActiveForDownload.mockResolvedValue(file);
    fileAssetStorageService.getObjectStat.mockResolvedValue({
      exists: true,
      size: 10,
      mime: 'application/pdf',
    });
    fileAssetStorageService.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from('0123456789')),
      size: 10,
      mime: 'application/pdf',
    });

    await controller.download(
      'file_access',
      { user: { id: 7, role: 'user' } } as any,
      res,
      undefined,
    );
    await new Promise(resolve => setImmediate(resolve));

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe('10');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toContain('attachment;');
    expect(res.body()).toBe('0123456789');
    expect(fileAssetStorageService.getObjectStream).toHaveBeenCalledWith(
      'private',
      { bucket: undefined, objectKey: 'users/random/report.pdf', range: undefined },
      'local',
    );
  });

  it('supports byte range requests for local private files', async () => {
    const file = createFile();
    const res = createResponse();
    fileAssetService.findActiveForPreview.mockResolvedValue(file);
    fileAssetStorageService.getObjectStat.mockResolvedValue({ exists: true, size: 10 });
    fileAssetStorageService.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from('0123')),
      size: 4,
      mime: 'application/pdf',
    });

    await controller.preview(
      'file_access',
      { user: { id: 7, role: 'user' } } as any,
      res,
      'bytes=0-3',
    );

    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-3/10');
    expect(res.headers['content-length']).toBe('4');
    expect(fileAssetStorageService.getObjectStream).toHaveBeenCalledWith(
      'private',
      { bucket: undefined, objectKey: 'users/random/report.pdf', range: 'bytes=0-3' },
      'local',
    );
  });

  it('rejects invalid range requests before reading content', async () => {
    const file = createFile();
    const res = createResponse();
    fileAssetService.findActiveForDownload.mockResolvedValue(file);
    fileAssetStorageService.getObjectStat.mockResolvedValue({ exists: true, size: 10 });

    await controller.download(
      'file_access',
      { user: { id: 7, role: 'user' } } as any,
      res,
      'bytes=20-30',
    );

    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */10');
    expect(fileAssetStorageService.getObjectStream).not.toHaveBeenCalled();
  });

  it('redirects object storage files to a short-lived signed url after auth', async () => {
    const file = createFile({ storageProvider: 'objstore', bucket: 'private-bucket' });
    const res = createResponse();
    fileAssetService.findActiveForDownload.mockResolvedValue(file);
    fileAssetStorageService.createSignedReadUrl.mockResolvedValue('https://signed.example/file');

    await controller.download(
      'file_access',
      { user: { id: 7, role: 'user' } } as any,
      res,
      undefined,
    );

    expect(fileAssetStorageService.createSignedReadUrl).toHaveBeenCalledWith(
      'private',
      expect.objectContaining({
        bucket: 'private-bucket',
        objectKey: 'users/random/report.pdf',
        expiresInSeconds: 900,
      }),
      'objstore',
    );
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://signed.example/file');
  });

  it('uses the same configured signed URL TTL for tool outputs', async () => {
    const file = createFile({
      storageProvider: 'objstore',
      bucket: 'private-bucket',
      purpose: 'tool_output',
      origin: 'pdf_processor',
    } as Partial<FileAssetEntity>);
    const res = createResponse();
    globalConfigService.getConfigs.mockResolvedValue(900);
    fileAssetService.findActiveForPreview.mockResolvedValue(file);
    fileAssetStorageService.createSignedReadUrl.mockResolvedValue('https://signed.example/file');

    await controller.preview(
      'file_access',
      { user: { id: 7, role: 'user' } } as any,
      res,
      undefined,
    );

    expect(fileAssetStorageService.createSignedReadUrl).toHaveBeenCalledWith(
      'private',
      expect.objectContaining({
        expiresInSeconds: 900,
      }),
      'objstore',
    );
  });

  it('rejects oversized previews before reading local content', async () => {
    const file = createFile({ size: 2 * 1024 * 1024 });
    const res = createResponse();
    globalConfigService.getConfigs.mockResolvedValue(1);
    fileAssetService.findActiveForPreview.mockResolvedValue(file);

    await expect(
      controller.preview('file_access', { user: { id: 7, role: 'user' } } as any, res, undefined),
    ).rejects.toThrow('文件超过在线预览上限，请下载后查看。');
    expect(fileAssetStorageService.getObjectStat).not.toHaveBeenCalled();
    expect(fileAssetStorageService.getObjectStream).not.toHaveBeenCalled();
  });

  it('streams public preview without requiring an authenticated actor', async () => {
    const file = createFile({
      storageScope: 'public',
      visibility: 'public',
      objectKey: 'public/202605/file_access.pdf',
    });
    const res = createResponse();
    fileAssetService.findActivePublicForPreview.mockResolvedValue(file);
    fileAssetStorageService.getObjectStat.mockResolvedValue({
      exists: true,
      size: 6,
      mime: 'application/pdf',
    });
    fileAssetStorageService.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from('public')),
      size: 6,
      mime: 'application/pdf',
    });

    await controller.publicPreview('file_access', res, undefined);
    await new Promise(resolve => setImmediate(resolve));

    expect(fileAssetService.findActivePublicForPreview).toHaveBeenCalledWith('file_access');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.body()).toBe('public');
  });

  it('forces scriptable public files to download with a sandbox CSP', async () => {
    const file = createFile({
      storageScope: 'public',
      visibility: 'public',
      name: 'evil.xml',
      originalName: 'evil.xml',
      mime: 'text/xml',
      ext: 'xml',
      objectKey: 'public/202605/file_access.xml',
    });
    const res = createResponse();
    fileAssetService.findActivePublicForPreview.mockResolvedValue(file);
    fileAssetStorageService.getObjectStat.mockResolvedValue({
      exists: true,
      size: 5,
      mime: 'text/xml',
    });
    fileAssetStorageService.getObjectStream.mockResolvedValue({
      stream: Readable.from(Buffer.from('<x/>!')),
      size: 5,
      mime: 'text/xml',
    });

    await controller.publicPreview('file_access', res, undefined);
    await new Promise(resolve => setImmediate(resolve));

    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  });

  it('marks public file routes as public auth metadata', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, FileAccessController.prototype.publicPreview)).toBe(
      true,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, FileAccessController.prototype.publicDownload)).toBe(
      true,
    );
  });
});
