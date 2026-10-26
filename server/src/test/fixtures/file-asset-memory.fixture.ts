import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { FileAssetService } from '../../modules/fileAsset/fileAsset.service';

declare const jest: any;

/** 内存行沿用仓库原有的宽松形态（any），只在这里集中声明一次。 */
type MemoryRow = Record<string, any>;

/**
 * 与实体一致：bucket / objectKey 是 select: false，查询没有 addSelect 时结果里不带这两列。
 * 带上时返回行本身，不带时返回去掉这两列的副本。
 * 夹具只模拟这两列的投影；排序只认 `file.id`（按 id 数值），其余按写入顺序，用例要按写入顺序准备数据。
 */
function project(row: MemoryRow | null, withStorage: boolean): MemoryRow | null {
  if (!row || withStorage) return row;
  const { bucket: _bucket, objectKey: _objectKey, ...rest } = row;
  return rest;
}

/** Replaces only database and object storage I/O with synthetic in-memory rows. */
export function createFileAssetMemoryFixture() {
  const rows = new Map<string, MemoryRow>();
  const objects = new Map<string, Buffer>();
  const locks = new Map<string, Promise<void>>();
  const repository = {
    manager: {
      dataSource: {
        createQueryRunner: () => {
          let unlock: (() => void) | undefined;
          return {
            manager: { getRepository: () => repository },
            connect: async () => {},
            query: async (sql: string, [key]: string[]) => {
              if (sql.includes('GET_LOCK')) {
                const previous = locks.get(key) || Promise.resolve();
                const held = new Promise<void>(resolve => {
                  unlock = resolve;
                });
                locks.set(
                  key,
                  previous.then(() => held),
                );
                await previous;
                return [{ acquired: 1 }];
              }
              unlock?.();
              unlock = undefined;
              return [];
            },
            release: async () => {
              unlock?.();
            },
          };
        },
      },
    },
    create: (value: unknown) => value,
    findOne: async ({ where }: { where: { fileId: string } }) =>
      project(rows.get(where.fileId) || null, false),
    update: async (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      for (const row of rows.values())
        if (Object.entries(where).every(([key, value]) => row[key] === value))
          Object.assign(row, patch);
    },
    save: jest.fn(async (value: MemoryRow) => {
      // 与 TypeORM 一致：值为 undefined 的属性不写入，查询时没选出的列保持原值
      const defined = Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined),
      );
      const row: MemoryRow = {
        createdAt: new Date(),
        expiresAt: null,
        ...rows.get(value.fileId),
        ...defined,
        updatedAt: new Date(),
      };
      rows.set(row.fileId, row);
      return row;
    }),
    createQueryBuilder: () => {
      let params: any = {};
      let limit = Infinity;
      let descending = false;
      let orderById = false;
      let selectMaxId = false;
      let withStorage = false;
      const matches = (row: MemoryRow) =>
        Object.entries(params).every(([key, value]: [string, any]) => {
          if (key === 'now')
            return params.activeStatus ? true : !row.expiresAt || row.expiresAt > value;
          if (['activeStatus', 'failedStatus', 'processingStatus', 'staleBefore'].includes(key))
            return true;
          if (key === 'controlOrigin') return row.origin !== value;
          if (key === 'replacingFileId') return row.fileId !== value;
          if (key === 'beforeId') return Number(row.id) < value;
          if (key === 'after') return Number(row.id) > value;
          if (key === 'upTo') return Number(row.id) <= value;
          if (key === 'quotaStatuses') return value.includes(row.status);
          if (key === 'sandboxOwner' || key === 'sandboxGeneration')
            return row.metadata?.[key] === value;
          return row[key] === value;
        }) &&
        (!params.activeStatus ||
          row.status === 'failed' ||
          (row.status === 'active' && row.expiresAt && row.expiresAt <= params.now) ||
          (row.status === 'processing' &&
            row.updatedAt <= params.staleBefore &&
            // 与 SQL 相同：未到期（或没有到期时间）的沙箱登记不算超时候选
            (row.origin == null ||
              row.origin !== 'sandbox_turn' ||
              (row.expiresAt != null && row.expiresAt <= params.now))));
      const query = {
        select: (selection?: string) => {
          if (selection === 'MAX(file.id)') selectMaxId = true;
          return query;
        },
        addSelect: (selection: string | string[]) => {
          const columns = Array.isArray(selection) ? selection : [selection];
          if (columns.some(column => column.endsWith('.objectKey'))) withStorage = true;
          return query;
        },
        orderBy: (key: string, direction: 'ASC' | 'DESC') => {
          descending = direction === 'DESC';
          orderById = key === 'file.id';
          return query;
        },
        addOrderBy: () => query,
        take: (count: number) => {
          limit = count;
          return query;
        },
        where: (_sql: string, values?: Record<string, unknown>) => {
          params = { ...params, ...values };
          return query;
        },
        andWhere: (_sql: string, values?: Record<string, unknown>) => {
          params = { ...params, ...values };
          return query;
        },
        getOne: async () => project(rows.get(params.fileId) || null, withStorage),
        getRawOne: async () =>
          selectMaxId
            ? {
                maxId:
                  [...rows.values()]
                    .filter(matches)
                    .reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) || null,
              }
            : {
                total: [...rows.values()]
                  .filter(matches)
                  .reduce((n, row) => n + Number(row.size), 0),
              },
        getMany: async () => {
          const found = [...rows.values()].filter(matches);
          if (orderById) found.sort((a, b) => Number(a.id) - Number(b.id));
          return (descending ? found.reverse() : found)
            .slice(0, limit)
            .map(row => project(row, withStorage));
        },
      };
      return query;
    },
  };
  const storage = {
    resolveProviderName: async () => 'local',
    putObject: jest.fn(async (_scope: string, input: { objectKey: string; body: Buffer }) => {
      objects.set(input.objectKey, input.body);
      return {
        objectKey: input.objectKey,
        size: input.body.length,
        sha256: createHash('sha256').update(input.body).digest('hex'),
      };
    }),
    deleteObject: jest.fn(async (_scope: string, input: { objectKey: string }) => {
      objects.delete(input.objectKey);
    }),
    getObjectStat: async (_scope: string, input: { objectKey: string }) => ({
      exists: objects.has(input.objectKey),
      size: objects.get(input.objectKey)?.length,
    }),
    getObjectStream: jest.fn(async (_scope: string, input: { objectKey: string }) => ({
      stream: Readable.from([objects.get(input.objectKey)]),
    })),
  };
  const files = new FileAssetService(repository as any, storage as any);
  return { rows, objects, files, storage, repository };
}
