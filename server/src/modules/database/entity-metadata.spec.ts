import { readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { assertCurrentSchemaManifest, buildSchemaManifest } from './schema-manifest';

declare const describe: any;
declare const expect: any;
declare const it: any;

/**
 * 实体元数据构建回归：不连数据库，把 src 下所有 *.entity.ts 交给 TypeORM 构建元数据。
 * 能抓住「索引 / 关系引用了已删除的列」这类只在真实启动时才爆的错误。
 */
function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.entity.ts')) out.push(full);
  }
  return out;
}

describe('entity metadata', () => {
  it('builds TypeORM metadata for every entity in src without a database', async () => {
    const files = walk(path.resolve(__dirname, '../..'));
    for (const file of files) require(file);
    const entities = getMetadataArgsStorage().tables.map(table => table.target as Function);
    expect(entities.length).toBeGreaterThan(10);

    const dataSource = new DataSource({ type: 'mysql', database: 'metadata_check', entities });
    await (dataSource as any).buildMetadatas();
    expect(dataSource.entityMetadatas.length).toBe(new Set(entities).size);
    if (process.env.UPDATE_DATABASE_BASELINE === '1') {
      writeFileSync(
        path.join(__dirname, 'schema.current.json'),
        `${JSON.stringify(buildSchemaManifest(dataSource), null, 2)}\n`,
      );
    } else assertCurrentSchemaManifest(dataSource);
  });
});
