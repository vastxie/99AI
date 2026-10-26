import { createRequire } from 'node:module';

const runtimeRequire = createRequire(__filename);

export function importDynamic<TModule = unknown>(modulePath: string): Promise<TModule> {
  return Promise.resolve(runtimeRequire(modulePath));
}
