import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as baseline from './schema.current.json';

export const DATABASE_BASELINE_VERSION = 1;

/** 使用实际驱动的类型/default 规范化；不建立连接。 */
export function buildSchemaManifest(source: DataSource) {
  const tables = source.entityMetadatas
    .map(table => ({
      name: table.tableName,
      engine: table.engine || null,
      columns: table.columns
        .map(column => ({
          name: column.databaseName,
          type: source.driver.normalizeType(column),
          length: column.length || null,
          precision: column.precision ?? null,
          scale: column.scale ?? null,
          nullable: column.isNullable,
          primary: column.isPrimary,
          generated: column.isGenerated ? column.generationStrategy : null,
          default: source.driver.normalizeDefault(column) ?? null,
          unsigned: column.unsigned || false,
          // TypeORM 1.x 删除了 zerofill；保留恒为 false 的键，已部署库中存储的结构指纹保持不变
          zerofill: false,
          onUpdate: column.onUpdate || null,
          asExpression: column.asExpression || null,
          generatedType: column.generatedType || null,
          charset: column.charset || null,
          collation: column.collation || null,
          comment: column.comment || '',
          enum: column.enum || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      indices: table.indices
        .map(index => ({
          name: index.name,
          columns: index.columns.map(column => column.databaseName),
          unique: index.isUnique,
          fulltext: index.isFulltext || false,
          spatial: index.isSpatial || false,
          where: index.where || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      uniques: table.uniques
        .map(unique => ({
          name: unique.name,
          columns: unique.columns.map(column => column.databaseName),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      foreignKeys: table.foreignKeys
        .map(key => ({
          name: key.name,
          columns: key.columnNames,
          target: key.referencedTablePath,
          targetColumns: key.referencedColumnNames,
          onDelete: key.onDelete || null,
          onUpdate: key.onUpdate || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      checks: table.checks
        .map(check => ({ name: check.name, expression: check.expression }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { version: DATABASE_BASELINE_VERSION, charset: 'utf8mb4', tables };
}

export function schemaFingerprint(source: DataSource): string {
  return createHash('sha256')
    .update(JSON.stringify(buildSchemaManifest(source)))
    .digest('hex');
}

export function assertCurrentSchemaManifest(source: DataSource): void {
  const manifest = buildSchemaManifest(source);
  const expected = baseline as ReturnType<typeof buildSchemaManifest>;
  if (
    expected.version !== manifest.version ||
    expected.charset !== manifest.charset ||
    manifest.tables.some(table => {
      const saved = expected.tables.find(item => item.name === table.name);
      return !saved || JSON.stringify(saved) !== JSON.stringify(table);
    })
  )
    throw new Error('当前 Entity 与已审核的数据库结构清单不一致。');
}
