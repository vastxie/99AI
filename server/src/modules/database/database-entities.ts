import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { getMetadataArgsStorage } from 'typeorm';
import { DatabaseBaselineEntity } from './database-baseline.entity';

let rootModule: unknown;

/** 由组合根在装饰器求值完成后登记；不实例化任何服务。 */
export function configureDatabaseRoot(root: unknown): void {
  rootModule = root;
}

export async function resolveDatabaseEntities(root: unknown = rootModule): Promise<Function[]> {
  if (!root) throw new Error('数据库缺少应用模块图。');
  const entities = new Set<Function>([DatabaseBaselineEntity]);
  const visited = new Set<unknown>();
  const tableTargets = getMetadataArgsStorage()
    .tables.map(table => table.target)
    .filter((target): target is Function => typeof target === 'function');
  const visit = async (entry: any): Promise<void> => {
    entry = await entry;
    if (entry?.forwardRef) entry = entry.forwardRef();
    if (!entry || visited.has(entry)) return;
    visited.add(entry);
    const module = entry.module || entry;
    if (entry.module === TypeOrmModule && Array.isArray(entry.providers)) {
      const tokens = new Set(
        entry.providers.map((provider: { provide?: unknown }) => provider.provide),
      );
      for (const entity of tableTargets)
        if (tokens.has(getRepositoryToken(entity))) entities.add(entity);
    }
    const imports = [
      ...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) || []),
      ...(entry.imports || []),
    ];
    for (const imported of imports) await visit(imported);
  };
  await visit(root);
  if (entities.size < 2) throw new Error('应用未装配数据库实体。');
  return [...entities];
}
