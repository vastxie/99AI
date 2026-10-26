import { BadRequestException } from '@nestjs/common';
import { StorageProviderRegistry } from '@/modules/fileAsset/storage/storage-provider.registry';
import { assertCosBucketName, CosPrivateStorageProvider } from './cos-storage.provider';
import { CosStorageFactory } from './cos-storage.factory';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const options = (bucket: string) => ({
  bucket,
  region: 'ap-guangzhou',
  secretId: 'example-secret-id',
  secretKey: 'example-secret-key',
});

/** 与真实 SDK 一致的回调式替身：记录每次调用的方法与参数 */
const createClient = () => {
  const calls: Array<{ method: string; params: any }> = [];
  const reply =
    (method: string, data: unknown) =>
    (params: unknown, callback: (error: Error | null, data: unknown) => void) => {
      calls.push({ method, params });
      callback(null, data);
    };
  return {
    calls,
    client: {
      putObject: reply('putObject', { ETag: '"e"' }),
      getObject: reply('getObject', { Body: Buffer.from('x'), headers: {} }),
      headObject: reply('headObject', { headers: {} }),
      deleteObject: reply('deleteObject', {}),
      getObjectUrl: reply('getObjectUrl', { Url: 'https://cos.example.com/signed' }),
    },
  };
};

describe('assertCosBucketName', () => {
  it('accepts BucketName-APPID within the 60-character host and rejects the rest', () => {
    // 腾讯云文档的例子：完整域名恰好 60 个字符
    const longest = `${'1'.repeat(21)}-1250000000`;
    expect(`${longest}.cos.ap-beijing.myqcloud.com`).toHaveLength(60);
    for (const name of ['abc-1250000000', 'a-b-1250000000', longest, ' trimmed-1250000000 ']) {
      expect(assertCosBucketName(name, 'ap-beijing')).toBe(name.trim());
    }
    for (const name of [
      `${'1'.repeat(22)}-1250000000`,
      'abc',
      '-abc-1250000000',
      'abc--1250000000',
      'Abc-1250000000',
      'abc-12a',
      'a.b-1250000000',
      '',
    ]) {
      expect(() => assertCosBucketName(name, 'ap-beijing')).toThrow(BadRequestException);
    }
  });
});

describe('CosPrivateStorageProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads, stats, deletes and signs in the recorded bucket even when the default bucket is invalid', async () => {
    const { calls, client } = createClient();
    const provider = new CosPrivateStorageProvider(options('Bad_Bucket'), client);
    const record = { bucket: 'records-1250000000', objectKey: 'users/stor_a/report.pdf' };

    await provider.getObjectStream(record);
    await provider.getObjectStat(record);
    await provider.deleteObject(record);
    await expect(
      provider.createSignedReadUrl({
        ...record,
        expiresInSeconds: 120,
        responseContentType: 'application/pdf',
      }),
    ).resolves.toBe('https://cos.example.com/signed');

    expect(calls.map(item => [item.method, item.params.Bucket, item.params.Region])).toEqual([
      ['getObject', 'records-1250000000', 'ap-guangzhou'],
      ['headObject', 'records-1250000000', 'ap-guangzhou'],
      ['deleteObject', 'records-1250000000', 'ap-guangzhou'],
      ['getObjectUrl', 'records-1250000000', 'ap-guangzhou'],
    ]);
    expect(calls[3].params).toEqual({
      Bucket: 'records-1250000000',
      Region: 'ap-guangzhou',
      Key: 'users/stor_a/report.pdf',
      Sign: true,
      Expires: 120,
      Query: { 'response-content-type': 'application/pdf' },
    });
    await expect(
      provider.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      provider.getObjectStat({ bucket: 'records', objectKey: 'users/stor_a/report.pdf' }),
    ).rejects.toThrow(BadRequestException);
    expect(calls).toHaveLength(4);
  });

  it('writes to the default bucket and returns it', async () => {
    const { calls, client } = createClient();
    const provider = new CosPrivateStorageProvider(options('default-1250000000'), client);

    await expect(
      provider.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).resolves.toMatchObject({ bucket: 'default-1250000000', objectKey: 'users/stor_a/new.bin' });
    expect(calls[0].params).toMatchObject({ Bucket: 'default-1250000000', Region: 'ap-guangzhou' });
  });

  it('signs the recorded bucket with the real SDK offline', async () => {
    const provider = new CosPrivateStorageProvider(options('Bad_Bucket'));

    const signed = new URL(
      await provider.createSignedReadUrl({
        bucket: 'records-1250000000',
        objectKey: 'users/stor_a/report.pdf',
        expiresInSeconds: 120,
      }),
    );

    expect(`${signed.origin}${signed.pathname}`).toBe(
      'https://records-1250000000.cos.ap-guangzhou.myqcloud.com/users/stor_a/report.pdf',
    );
    expect(signed.searchParams.get('q-signature')).toMatch(/^[0-9a-f]{40}$/);
    expect(signed.toString()).not.toContain('example-secret-key');
  });
});

describe('CosStorageFactory', () => {
  it('registers itself and fails closed when required config is missing', async () => {
    const registry = new StorageProviderRegistry();
    const factory = new CosStorageFactory(registry);

    expect(registry.get('cos')).toBe(factory);
    expect(registry.names()).toEqual(['cos']);
    await expect(
      factory.create('private', { getConfigs: async () => ({ privateCosBucket: 'only-bucket' }) }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      factory.create('private', {
        getConfigs: async () => ({
          privateCosBucket: 'b-1250000000',
          privateCosRegion: 'ap guangzhou',
          privateCosSecretId: 'example-secret-id',
          privateCosSecretKey: 'example-secret-key',
        }),
      }),
    ).rejects.toThrow('存储地域不合法');
  });
});
