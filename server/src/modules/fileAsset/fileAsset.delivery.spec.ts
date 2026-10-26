import { createHash } from 'node:crypto';
import { FileAssetService } from './fileAsset.service';
import type { FileAssetEntity } from './fileAsset.entity';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

function fixture(quotaMb = 0) {
  const rows = new Map<string, FileAssetEntity>();
  const repository = {
    manager: {
      dataSource: {
        createQueryRunner: () => ({
          manager: { getRepository: () => repository },
          connect: async () => {},
          query: async () => [{ acquired: 1 }],
          release: async () => {},
        }),
      },
    },
    create: (value: unknown) => value,
    save: jest.fn(async (value: FileAssetEntity) => {
      const saved = { ...value, updatedAt: new Date() };
      rows.set(saved.fileId, saved);
      return saved;
    }),
    createQueryBuilder: () => {
      let params: Record<string, unknown> = {};
      const query = {
        addSelect: () => query,
        select: () => query,
        orderBy: () => query,
        addOrderBy: () => query,
        getRawOne: async () => ({
          total: [...rows.values()]
            .filter(
              row =>
                row.userId === params.userId &&
                row.fileId !== params.replacingFileId &&
                ['active', 'processing', 'failed'].includes(row.status),
            )
            .reduce((total, row) => total + Number(row.size), 0),
        }),
        where: (_sql: string, values: Record<string, unknown>) => {
          params = { ...params, ...values };
          return query;
        },
        andWhere: (_sql: string, values: Record<string, unknown>) => {
          params = { ...params, ...values };
          return query;
        },
        getOne: async () => rows.get(String(params.fileId)) || null,
        getMany: async () =>
          [...rows.values()].filter(
            row =>
              row.turnId === params.turnId &&
              (params.userId ? row.userId === params.userId : row.visitorId === params.visitorId) &&
              (!params.messageId ||
                (row.messageId === params.messageId &&
                  row.purpose === params.purpose &&
                  row.status === params.status &&
                  (params.userId ? row.visitorId === null : row.userId === null) &&
                  (!row.expiresAt || row.expiresAt > params.now!))),
          ),
      };
      return query;
    },
  };
  const storage = {
    resolveProviderName: jest.fn().mockResolvedValue('local'),
    putObject: jest.fn(async (_scope: string, input: { objectKey: string; body: Buffer }) => ({
      objectKey: input.objectKey,
      size: input.body.length,
      sha256: createHash('sha256').update(input.body).digest('hex'),
    })),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const createService = () =>
    new FileAssetService(repository as any, storage as any, undefined, {
      getConfigs: async () => ({ fileAssetUserQuotaMb: quotaMb }),
    } as any);
  const input = {
    userId: 7,
    messageId: 'message_1',
    buffer: Buffer.from('delivery bytes'),
    name: 'result.txt',
    mime: 'text/plain',
    purpose: 'tool_output' as const,
    delivery: { turnId: 'turn_1', sourceKey: 'result.txt' },
  };
  return { rows, storage, createService, input };
}

describe('FileAsset durable tool delivery', () => {
  it('reprojects the original active turn after restart without rewriting bytes', async () => {
    const { rows, storage, createService, input } = fixture();
    const first = await createService().createFromBuffer(input);
    const query = { userId: 7, messageId: input.messageId, turnId: input.delivery.turnId };
    expect((await createService().listTurnOutputs(query)).map(file => file.fileId)).toEqual([
      first.fileId,
    ]);
    for (const variant of [
      { ...query, userId: 8 },
      { ...query, messageId: 'other' },
      { ...query, turnId: 'other' },
      { visitorId: 'visitor', messageId: query.messageId, turnId: query.turnId },
    ]) {
      expect(await createService().listTurnOutputs(variant)).toEqual([]);
    }
    for (const status of ['deleted', 'expired', 'failed', 'processing', 'inactive'] as const) {
      rows.get(first.fileId)!.status = status;
      expect(await createService().listTurnOutputs(query)).toEqual([]);
    }
    Object.assign(rows.get(first.fileId)!, { status: 'active', expiresAt: new Date(0) });
    expect(await createService().listTurnOutputs(query)).toEqual([]);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });
  it('creates one active asset across concurrent attempts and a service restart', async () => {
    const { rows, storage, createService, input } = fixture();
    const service = createService();
    const [first, second] = await Promise.all([
      service.createFromBuffer(input),
      service.createFromBuffer(input),
    ]);
    const restarted = await createService().createFromBuffer(input);
    expect(new Set([first.fileId, second.fileId, restarted.fileId]).size).toBe(1);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].status).toBe('active');
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it('recovers the same failed delivery row after storage returns', async () => {
    const { rows, storage, createService, input } = fixture();
    storage.putObject.mockRejectedValueOnce(new Error('synthetic storage failure'));
    await expect(createService().createFromBuffer(input)).rejects.toThrow(
      'synthetic storage failure',
    );
    const failedId = [...rows.keys()][0];
    const recovered = await createService().createFromBuffer(input);
    expect(recovered.fileId).toBe(failedId);
    expect(rows.size).toBe(1);
    expect(rows.get(failedId)?.status).toBe('active');
  });

  it('keeps different paths, content versions, owners and turns separate', async () => {
    const { rows, createService, input } = fixture();
    const service = createService();
    const variants = [
      input,
      { ...input, delivery: { ...input.delivery, sourceKey: 'another/result.txt' } },
      { ...input, buffer: Buffer.from('new content') },
      { ...input, userId: 8 },
      { ...input, messageId: 'message_2', delivery: { ...input.delivery, turnId: 'turn_2' } },
    ];
    for (const variant of variants) await service.createFromBuffer(variant);
    expect(rows.size).toBe(variants.length);
  });

  it('never republishes a file deleted by the user', async () => {
    const { rows, createService, input } = fixture();
    const service = createService();
    const first = await service.createFromBuffer(input);
    Object.assign(rows.get(first.fileId)!, {
      status: 'deleted',
      metadata: { fileContentCleanupTarget: 'user_deleted' },
    });
    await expect(service.createFromBuffer(input)).rejects.toThrow('不能重新发布');
  });

  it('counts all files in the turn across calls and restarts', async () => {
    const { createService, input } = fixture();
    for (let index = 0; index < 20; index += 1) {
      await createService().createFromBuffer({
        ...input,
        delivery: { ...input.delivery, sourceKey: `file-${index}` },
      });
    }
    await expect(createService().createFromBuffer(input)).rejects.toThrow('累计上限');
  });

  it('enforces the cumulative byte budget before writing the next object', async () => {
    const { rows, storage, createService, input } = fixture();
    const first = await createService().createFromBuffer(input);
    rows.get(first.fileId)!.size = 200 * 1024 * 1024;
    await expect(
      createService().createFromBuffer({
        ...input,
        delivery: { ...input.delivery, sourceKey: 'next' },
      }),
    ).rejects.toThrow('累计上限');
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it('does not activate bytes that finish uploading after cancellation', async () => {
    const { rows, storage, createService, input } = fixture();
    const controller = new AbortController();
    const original = storage.putObject.getMockImplementation();
    storage.putObject.mockImplementation(
      async (scope: string, object: { objectKey: string; body: Buffer }) => {
        const stored = await original(scope, object);
        controller.abort();
        return stored;
      },
    );
    await expect(
      createService().createFromBuffer({ ...input, signal: controller.signal }),
    ).rejects.toThrow('已取消');
    expect([...rows.values()].some(row => row.status === 'active')).toBe(false);
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });
  it('retries a failed row by counting its bytes once under an enabled user quota', async () => {
    const { rows, storage, createService, input } = fixture(1);
    const large = { ...input, buffer: Buffer.alloc(700 * 1024) };
    storage.putObject.mockRejectedValueOnce(new Error('synthetic upload failure'));
    storage.deleteObject.mockRejectedValueOnce(new Error('synthetic delete failure'));
    await expect(createService().createFromBuffer(large)).rejects.toThrow(
      'synthetic upload failure',
    );
    expect([...rows.values()][0].status).toBe('failed');
    const result = await createService().createFromBuffer(large);
    expect(rows.get(result.fileId)?.status).toBe('active');
    expect(rows.size).toBe(1);
    await expect(
      createService().createFromBuffer({
        ...large,
        buffer: Buffer.alloc(400 * 1024),
        delivery: { ...large.delivery, sourceKey: 'another' },
      }),
    ).rejects.toThrow('用户私有文件占用');
  });

  it('never republishes an expired asset on retry', async () => {
    const { rows, createService, input } = fixture();
    const first = await createService().createFromBuffer(input);
    rows.get(first.fileId)!.expiresAt = new Date(0);
    await expect(createService().createFromBuffer(input)).rejects.toThrow('文件已过期');
  });
});
