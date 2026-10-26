import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { FileAssetStorageService } from './fileAsset-storage.service';
import {
  LocalPrivateStorageProvider,
  LocalPublicStorageProvider,
} from './storage/local-storage.provider';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('FileAssetStorageService providers', () => {
  let tmpRoot: string;
  let publicRoot: string;
  let privateRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'file-asset-storage-'));
    publicRoot = path.join(tmpRoot, 'public-file');
    privateRoot = path.join(tmpRoot, 'private-file');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  function createConfigService(configs: Record<string, any>) {
    return {
      getConfigs: jest.fn(async (keys: string[]) => {
        if (keys.length === 1) return configs[keys[0]];
        return keys.reduce(
          (result, key) => {
            result[key] = configs[key];
            return result;
          },
          {} as Record<string, unknown>,
        );
      }),
    };
  }

  it('resolves local private storage to a non-public directory', async () => {
    const configService = createConfigService({
      privateStorageProvider: 'local',
      privateLocalBasePath: privateRoot,
    });
    const service = new FileAssetStorageService(configService as any);

    const result = await service.putObject('private', {
      objectKey: 'users/stor_a/file.txt',
      body: Buffer.from('private content'),
      mime: 'text/plain',
    });

    expect(result.objectKey).toBe('users/stor_a/file.txt');
    expect(result).not.toHaveProperty('url');
    await expect(fs.readFile(path.join(privateRoot, result.objectKey), 'utf8')).resolves.toBe(
      'private content',
    );
    await expect(
      fs.stat(path.join(process.cwd(), 'public', 'file', result.objectKey)),
    ).rejects.toBeTruthy();
  });

  it('keeps local public and local private read URLs separated', async () => {
    const publicProvider = new LocalPublicStorageProvider({
      rootDir: publicRoot,
      publicUrlPrefix: 'https://agent.example.com/file',
    });
    const privateProvider = new LocalPrivateStorageProvider({ rootDir: privateRoot });

    await publicProvider.putObject({
      objectKey: 'avatars/user.png',
      body: Buffer.from('png'),
      mime: 'image/png',
    });
    await privateProvider.putObject({
      objectKey: 'users/stor_a/report.pdf',
      body: Buffer.from('pdf'),
      mime: 'application/pdf',
    });

    await expect(
      publicProvider.createSignedReadUrl({
        objectKey: 'avatars/user.png',
        expiresInSeconds: 600,
      }),
    ).resolves.toBe('https://agent.example.com/file/avatars/user.png');
    await expect(
      privateProvider.createSignedReadUrl({
        objectKey: 'users/stor_a/report.pdf',
        expiresInSeconds: 600,
      }),
    ).rejects.toThrow('local private storage 不生成 signed URL');
  });

  it('streams local private content without exposing internal object keys', async () => {
    const provider = new LocalPrivateStorageProvider({ rootDir: privateRoot });
    const putResult = await provider.putObject({
      objectKey: 'users/stor_b/docs/readme.md',
      body: Buffer.from('# hello'),
      mime: 'text/markdown',
    });

    const stat = await provider.getObjectStat({ objectKey: putResult.objectKey });
    const readResult = await provider.getObjectStream({ objectKey: putResult.objectKey });

    expect(stat).toMatchObject({
      exists: true,
      size: 7,
    });
    await expect(readStream(readResult.stream)).resolves.toEqual(Buffer.from('# hello'));
  });

  it('deletes local private content idempotently by the durable object key', async () => {
    const provider = new LocalPrivateStorageProvider({ rootDir: privateRoot });
    const putResult = await provider.putObject({
      objectKey: 'users/stor_b/runtime/output.bin',
      body: Buffer.from('private output'),
    });

    await provider.deleteObject({ objectKey: putResult.objectKey });
    await provider.deleteObject({ objectKey: putResult.objectKey });

    await expect(provider.getObjectStat({ objectKey: putResult.objectKey })).resolves.toEqual({
      exists: false,
    });
  });

  it('rejects object keys that attempt to leave the storage root', async () => {
    const provider = new LocalPrivateStorageProvider({ rootDir: privateRoot });

    await expect(
      provider.putObject({
        objectKey: '../outside.txt',
        body: Buffer.from('bad'),
      }),
    ).rejects.toThrow('objectKey 包含非法路径片段');
  });

  it('fails closed when the configured provider is not registered by any storage pack', async () => {
    const configService = createConfigService({
      privateStorageProvider: 'objstore',
      privateS3Bucket: 'private-assets',
    });
    const service = new FileAssetStorageService(configService as any);

    await expect(service.createProvider('private')).rejects.toThrow(BadRequestException);
  });
  it.each(['bytes', 'inodes', 'unavailable'])(
    'rejects unsafe local capacity (%s) before publishing bytes',
    async (mode: string) => {
      const capacity = jest.spyOn(fs, 'statfs');
      if (mode === 'unavailable') capacity.mockRejectedValueOnce(new Error('statfs unavailable'));
      else
        capacity.mockResolvedValueOnce({
          bavail: mode === 'bytes' ? 1n : 999999n,
          bsize: 4096n,
          ffree: mode === 'inodes' ? 1n : 9999n,
        } as any);
      const provider = new LocalPrivateStorageProvider({ rootDir: privateRoot });
      await expect(
        provider.putObject({ objectKey: 'test.bin', body: Buffer.from('data') }),
      ).rejects.toThrow('空间不足或容量观测失败');
      expect(await fs.readdir(privateRoot)).toEqual([]);
    },
  );

  it('removes partial pending bytes after ENOSPC and preserves the final object contract', async () => {
    const provider = new LocalPrivateStorageProvider({ rootDir: privateRoot });
    const originalOpen = fs.open.bind(fs);
    jest.spyOn(fs, 'open').mockImplementationOnce(async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      jest.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
        await handle.write(Buffer.from('partial'));
        throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
      });
      return handle;
    });
    await expect(
      provider.putObject({ objectKey: 'test.bin', body: Buffer.from('complete') }),
    ).rejects.toThrow('no space');
    expect(await fs.readdir(privateRoot)).toEqual([]);
    await provider.putObject({ objectKey: 'test.bin', body: Buffer.from('complete') });
    expect(await fs.readFile(path.join(privateRoot, 'test.bin'), 'utf8')).toBe('complete');
    expect((await fs.stat(path.join(privateRoot, 'test.bin'))).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(privateRoot)).toEqual(['test.bin']);
    await fs.writeFile(path.join(privateRoot, 'test.bin.pending'), 'crash remainder');
    await provider.deleteObject({ objectKey: 'test.bin' });
    expect(await fs.readdir(privateRoot)).toEqual([]);
  });
});
