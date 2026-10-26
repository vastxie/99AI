import { BadRequestException } from '@nestjs/common';
import { StorageProviderRegistry } from '@/modules/fileAsset/storage/storage-provider.registry';
import { assertOssBucketName, OssPrivateStorageProvider } from './oss-storage.provider';
import { OssStorageFactory } from './oss-storage.factory';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** ali-oss 发请求用的 urllib：只替换这一层，真实工厂与 SDK 照常组装请求（SDK 会把截断的错误包装成自己的错误，所以只看截下的地址） */
const urllib = require(require.resolve('urllib', { paths: [require.resolve('ali-oss')] }));

const captureRequests = () => {
  const requests: string[] = [];
  jest.spyOn(urllib, 'request').mockImplementation(async (url: string) => {
    const parsed = new URL(String(url));
    requests.push(`${parsed.origin}${parsed.pathname}`);
    throw Object.assign(new Error('captured'), { name: 'Captured' });
  });
  return requests;
};

const createProvider = (bucket: string) =>
  new OssStorageFactory(new StorageProviderRegistry()).create('private', {
    getConfigs: async () => ({
      privateOssRegion: 'oss-cn-hangzhou',
      privateOssBucket: bucket,
      privateOssAccessKeyId: 'example-access-id',
      privateOssAccessKeySecret: 'example-access-secret',
    }),
  });

describe('assertOssBucketName', () => {
  it('accepts OSS bucket names as they are and rejects the rest', () => {
    for (const name of ['abc', 'a-1-b', `a${'b'.repeat(61)}c`, ' trimmed-bucket ']) {
      expect(assertOssBucketName(name)).toBe(name.trim());
    }
    for (const name of ['ab', 'a'.repeat(64), 'Abc', 'a.b', '-abc', 'abc-', 'ab_c', '']) {
      expect(() => assertOssBucketName(name)).toThrow(BadRequestException);
    }
  });
});

describe('OssPrivateStorageProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads, stats, deletes and signs in the recorded bucket even when the default bucket is invalid', async () => {
    const requests = captureRequests();
    const provider = await createProvider('Bad_Bucket');
    const record = { bucket: 'records-a', objectKey: 'users/stor_a/report.pdf' };
    const expected = 'https://records-a.oss-cn-hangzhou.aliyuncs.com/users/stor_a/report.pdf';

    await expect(provider.getObjectStream(record)).rejects.toThrow();
    await expect(provider.getObjectStat(record)).rejects.toThrow();
    await expect(provider.deleteObject(record)).rejects.toThrow();
    const signed = new URL(
      await provider.createSignedReadUrl({ ...record, expiresInSeconds: 120 }),
    );

    expect(requests).toEqual([expected, expected, expected]);
    expect(`${signed.origin}${signed.pathname}`).toBe(expected);
    await expect(
      provider.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      provider.getObjectStat({ bucket: 'Bad_Record', objectKey: 'users/stor_a/report.pdf' }),
    ).rejects.toThrow(BadRequestException);
    expect(requests).toHaveLength(3);
  });

  it('writes to the default bucket and returns it', async () => {
    const requests = captureRequests();
    const provider = await createProvider('default-b');

    await expect(
      provider.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).rejects.toThrow();
    await expect(provider.getObjectStream({ objectKey: 'users/stor_a/new.bin' })).rejects.toThrow();

    expect(requests).toEqual([
      'https://default-b.oss-cn-hangzhou.aliyuncs.com/users/stor_a/new.bin',
      'https://default-b.oss-cn-hangzhou.aliyuncs.com/users/stor_a/new.bin',
    ]);

    const client = { put: jest.fn().mockResolvedValue({ res: { headers: { etag: '"e"' } } }) };
    const injected = new OssPrivateStorageProvider(
      {
        region: 'oss-cn-hangzhou',
        bucket: 'default-b',
        accessKeyId: 'example-access-id',
        accessKeySecret: 'example-access-secret',
      },
      () => client,
    );
    await expect(
      injected.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).resolves.toMatchObject({ bucket: 'default-b', objectKey: 'users/stor_a/new.bin' });
  });

  it('creates one client per bucket and reuses it', async () => {
    const clients = new Map<string, any>();
    const createClient = jest.fn((bucket: string) => {
      const client = {
        head: jest.fn().mockResolvedValue({ res: { headers: {} } }),
        signatureUrl: jest.fn(() => `https://${bucket}.oss.example/signed`),
      };
      clients.set(bucket, client);
      return client;
    });
    const provider = new OssPrivateStorageProvider(
      {
        region: 'oss-cn-hangzhou',
        bucket: 'default-b',
        accessKeyId: 'example-access-id',
        accessKeySecret: 'example-access-secret',
      },
      createClient,
    );

    await provider.getObjectStat({ bucket: 'records-a', objectKey: 'a.bin' });
    await provider.getObjectStat({ bucket: 'records-a', objectKey: 'b.bin' });
    await expect(
      provider.createSignedReadUrl({
        objectKey: 'users/stor_a/report.pdf',
        expiresInSeconds: 120,
        responseContentDisposition: 'attachment; filename="report.pdf"',
      }),
    ).resolves.toBe('https://default-b.oss.example/signed');

    expect(createClient.mock.calls.map(([bucket]: [string]) => bucket)).toEqual([
      'records-a',
      'default-b',
    ]);
    expect(clients.get('records-a').head).toHaveBeenCalledTimes(2);
    expect(clients.get('default-b').signatureUrl).toHaveBeenCalledWith('users/stor_a/report.pdf', {
      expires: 120,
      method: 'GET',
      response: { 'content-disposition': 'attachment; filename="report.pdf"' },
    });
  });
});

describe('OssStorageFactory', () => {
  it('registers itself and fails closed when required config is missing', async () => {
    const registry = new StorageProviderRegistry();
    const factory = new OssStorageFactory(registry);

    expect(registry.get('oss')).toBe(factory);
    expect(registry.names()).toEqual(['oss']);
    await expect(
      factory.create('private', { getConfigs: async () => ({ privateOssBucket: 'only-bucket' }) }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      factory.create('private', {
        getConfigs: async () => ({
          privateOssRegion: 'oss_cn_hangzhou',
          privateOssBucket: 'b-1',
          privateOssAccessKeyId: 'example-access-id',
          privateOssAccessKeySecret: 'example-access-secret',
        }),
      }),
    ).rejects.toThrow('存储地域不合法');
  });
});
