import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { StorageProviderRegistry } from '@/modules/fileAsset/storage/storage-provider.registry';
import {
  assertS3BucketName,
  presignS3GetUrl,
  S3PrivateStorageProvider,
} from './s3-storage.provider';
import { S3StorageFactory } from './s3-storage.factory';

declare const afterEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

/** S3 客户端依赖链上的 smithy 模块：签名基准与网络层替身都用 SDK 自己装的那一份 */
const clientS3Path = require.resolve('@aws-sdk/client-s3');
const { SignatureV4 } = require(require.resolve('@smithy/signature-v4', { paths: [clientS3Path] }));
const { NodeHttpHandler } = require(
  require.resolve('@smithy/node-http-handler', { paths: [clientS3Path] }),
);

/** 独立的 SHA-256（Node crypto），供 smithy 签名器使用 */
class NodeSha256 {
  private readonly hash;
  constructor(secret?: Uint8Array | string) {
    this.hash = secret ? createHmac('sha256', Buffer.from(secret as any)) : createHash('sha256');
  }
  update(data: Uint8Array | string) {
    this.hash.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  }
  async digest() {
    return new Uint8Array(this.hash.digest());
  }
}

const KEY = "dir/中文 文件 100%!'()*~.txt";
const DISPOSITION = 'attachment; filename="报告 (1).pdf"';

/** 只替换网络层：真实工厂与 SDK 照常组装请求，发出前截下来 */
const captureRequests = () => {
  const requests: string[] = [];
  jest.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request: any) => {
    const port = request.port ? `:${request.port}` : '';
    requests.push(`${request.protocol}//${request.hostname}${port}${request.path}`);
    throw Object.assign(new Error('captured'), { name: 'Captured' });
  });
  return requests;
};

const createProvider = (configs: Record<string, string>) =>
  new S3StorageFactory(new StorageProviderRegistry()).create('private', {
    getConfigs: async () => ({
      privateS3AccessKeyId: 'example-access-id',
      privateS3SecretAccessKey: 'example-secret-key',
      ...configs,
    }),
  });

describe('assertS3BucketName', () => {
  it('accepts S3 bucket names as they are and rejects the rest', () => {
    for (const name of ['abc', 'a.b-c', `a${'b'.repeat(61)}c`, ' trimmed-bucket ']) {
      expect(assertS3BucketName(name)).toBe(name.trim());
    }
    for (const name of [
      'ab',
      'a'.repeat(64),
      'Abc',
      'a..b',
      '192.168.1.1',
      'xn--abc',
      'abc-s3alias',
      '-abc',
      'abc-',
      '.abc',
      'ab_c',
      'ab c',
      '',
    ]) {
      expect(() => assertS3BucketName(name)).toThrow(BadRequestException);
    }
  });
});

describe('S3PrivateStorageProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads, stats, deletes and signs in the recorded bucket even when the default bucket is invalid', async () => {
    const requests = captureRequests();
    const provider = await createProvider({
      privateS3Region: 'ap-southeast-1',
      privateS3Bucket: 'Bad_Bucket',
    });
    const record = { bucket: 'records.bucket', objectKey: 'users/stor_a/report.pdf' };

    await expect(provider.getObjectStream(record)).rejects.toThrow('captured');
    await expect(provider.getObjectStat(record)).rejects.toThrow('captured');
    await expect(provider.deleteObject(record)).rejects.toThrow('captured');
    const signed = new URL(
      await provider.createSignedReadUrl({ ...record, expiresInSeconds: 120 }),
    );

    expect(requests).toEqual(
      Array(3).fill(
        'https://s3.ap-southeast-1.amazonaws.com/records.bucket/users/stor_a/report.pdf',
      ),
    );
    expect(`${signed.origin}${signed.pathname}`).toBe(requests[0]);
    // 不带记录桶的操作才用默认桶：默认桶不合法时直接拒绝，不发请求
    await expect(
      provider.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      provider.getObjectStream({ objectKey: 'users/stor_a/report.pdf' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      provider.getObjectStream({ bucket: 'Bad_Record', objectKey: 'users/stor_a/report.pdf' }),
    ).rejects.toThrow(BadRequestException);
    expect(requests).toHaveLength(3);
  });

  it('writes to the default bucket and reads from the recorded one', async () => {
    const requests = captureRequests();
    const provider = await createProvider({
      privateS3Region: 'ap-southeast-1',
      privateS3Bucket: 'default-bucket',
    });

    await expect(
      provider.putObject({ objectKey: 'users/stor_a/new.bin', body: Buffer.from('x') }),
    ).rejects.toThrow('captured');
    await expect(
      provider.getObjectStream({ bucket: 'records-a', objectKey: 'users/stor_a/old.bin' }),
    ).rejects.toThrow('captured');

    expect(requests).toEqual([
      'https://default-bucket.s3.ap-southeast-1.amazonaws.com/users/stor_a/new.bin',
      'https://records-a.s3.ap-southeast-1.amazonaws.com/users/stor_a/old.bin',
    ]);
  });

  it('signs URLs that match the SDK addressing and an independent SigV4 signer', async () => {
    const cases = [
      { region: 'ap-southeast-1', bucket: 'plain-bucket' },
      { region: 'us-east-1', bucket: 'my.dotted.bucket' },
      {
        region: 'us-east-1',
        bucket: 'my.bucket',
        endpoint: 'https://minio.example.com:9000/prefix',
      },
      { region: 'auto', bucket: 'plain-bucket', endpoint: 'https://acct.r2.cloudflarestorage.com' },
    ];
    for (const item of cases) {
      jest.restoreAllMocks();
      const requests = captureRequests();
      const provider = await createProvider({
        privateS3Region: item.region,
        privateS3Bucket: item.bucket,
        ...(item.endpoint ? { privateS3Endpoint: item.endpoint } : {}),
      });
      const signed = new URL(
        await provider.createSignedReadUrl({
          objectKey: KEY,
          expiresInSeconds: 300,
          responseContentType: 'application/pdf',
          responseContentDisposition: DISPOSITION,
        }),
      );
      await expect(provider.getObjectStream({ objectKey: KEY })).rejects.toThrow('captured');

      // 寻址与编码：和 SDK 实际请求的地址逐字一致
      expect(`${signed.origin}${signed.pathname}`).toBe(requests[0]);
      expect(signed.pathname).toContain('%21%27%28%29%2A~.txt');

      // 签名：用 smithy 签名器按同样的参数独立计算
      const amzDate = signed.searchParams.get('X-Amz-Date') as string;
      const signingDate = new Date(
        `${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`,
      );
      const signer = new SignatureV4({
        service: 's3',
        region: item.region,
        credentials: {
          accessKeyId: 'example-access-id',
          secretAccessKey: 'example-secret-key',
        },
        sha256: NodeSha256,
        uriEscapePath: false,
        applyChecksum: false,
      });
      const expected = await signer.presign(
        {
          method: 'GET',
          protocol: signed.protocol,
          hostname: signed.hostname,
          port: signed.port ? Number(signed.port) : undefined,
          path: signed.pathname,
          headers: { host: signed.host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
          query: {
            'response-content-type': 'application/pdf',
            'response-content-disposition': DISPOSITION,
          },
        },
        {
          signingDate,
          expiresIn: 300,
          unsignableHeaders: new Set(['x-amz-content-sha256']),
          unhoistableHeaders: new Set(['x-amz-content-sha256']),
        },
      );
      expect(Object.fromEntries(signed.searchParams)).toEqual(expected.query);
    }
  });

  it('reproduces the presigned URL example in the AWS documentation', () => {
    const url = presignS3GetUrl({
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      date: new Date('2013-05-24T00:00:00Z'),
      expiresInSeconds: 86400,
    });

    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('keeps signed links short-lived and free of the secret', async () => {
    const provider = new S3PrivateStorageProvider({
      region: 'us-east-1',
      bucket: 'private-assets',
      accessKeyId: 'example-access-id',
      secretAccessKey: 'example-secret-key',
    });

    const signedUrl = await provider.createSignedReadUrl({
      objectKey: 'users/stor_a/report.pdf',
      expiresInSeconds: 120,
      responseContentType: 'application/pdf',
    });
    const capped = await provider.createSignedReadUrl({
      objectKey: 'users/stor_a/report.pdf',
      expiresInSeconds: 99999,
    });

    expect(signedUrl).toContain(
      'https://private-assets.s3.us-east-1.amazonaws.com/users/stor_a/report.pdf?',
    );
    expect(signedUrl).toContain('X-Amz-Expires=120');
    expect(capped).toContain('X-Amz-Expires=3600');
    expect(signedUrl).not.toContain('example-secret-key');
  });

  it('uses the same durable S3 object key for put and idempotent cleanup', async () => {
    const client = { send: jest.fn().mockResolvedValue({ ETag: '"etag"' }) };
    const provider = new S3PrivateStorageProvider(
      {
        region: 'us-east-1',
        bucket: 'private-assets',
        accessKeyId: 'example_access_key',
        secretAccessKey: 'example_secret_key',
      },
      client as any,
    );
    const body = Buffer.from('private output');
    const result = await provider.putObject({
      objectKey: 'users/stor_a/runtime/file_safe.bin',
      body,
      mime: 'application/octet-stream',
    });
    await provider.deleteObject({ objectKey: result.objectKey });

    expect(result).toMatchObject({
      bucket: 'private-assets',
      objectKey: 'users/stor_a/runtime/file_safe.bin',
      size: body.length,
    });
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'private-assets',
      Key: result.objectKey,
      Body: body,
    });
    expect(client.send.mock.calls[1][0].input).toMatchObject({
      Bucket: 'private-assets',
      Key: result.objectKey,
    });
  });
});

describe('S3StorageFactory', () => {
  it('registers itself and fails closed when required config is missing', async () => {
    const registry = new StorageProviderRegistry();
    const factory = new S3StorageFactory(registry);

    expect(registry.get('s3')).toBe(factory);
    expect(registry.names()).toEqual(['s3']);
    await expect(
      factory.create('private', { getConfigs: async () => ({ privateS3Bucket: 'only-bucket' }) }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      factory.create('private', {
        getConfigs: async () => ({
          privateS3Bucket: '   ',
          privateS3AccessKeyId: 'example-access-id',
          privateS3SecretAccessKey: 'example-secret-key',
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a region outside lowercase letters, digits and hyphens', async () => {
    await expect(
      createProvider({ privateS3Region: 'US East 1', privateS3Bucket: 'b-1' }),
    ).rejects.toThrow('存储地域不合法');
  });
});
