import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { discoverPacks, isPackEnabled } from './pack.loader';
import { assertPackDefinition, definePack } from './pack.types';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const afterEach: any;

class FakeModule {}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo',
    tier: 'system',
    description: '示例包',
    flag: 'DEMO_PACK_ENABLED',
    ...overrides,
  };
}

describe('isPackEnabled', () => {
  const pack = { flag: 'DEMO_PACK_ENABLED' };

  it('defaults to enabled and treats unknown values as enabled', () => {
    expect(isPackEnabled(pack, {})).toBe(true);
    expect(isPackEnabled(pack, { DEMO_PACK_ENABLED: 'true' })).toBe(true);
    expect(isPackEnabled(pack, { DEMO_PACK_ENABLED: 'garbage' })).toBe(true);
  });

  it('disables on false / 0 / off / no, ignoring case and whitespace', () => {
    for (const value of ['false', 'FALSE', ' 0 ', 'off', 'No']) {
      expect(isPackEnabled(pack, { DEMO_PACK_ENABLED: value })).toBe(false);
    }
  });
});

describe('definePack / assertPackDefinition', () => {
  it('accepts a complete manifest and attaches the module', () => {
    const pack = definePack(manifest(), FakeModule);
    expect(pack.id).toBe('demo');
    expect(pack.module).toBe(FakeModule);
  });

  it('rejects id / tier / flag / module problems with a clear message', () => {
    expect(() => definePack(manifest({ id: 'Demo_Pack' }), FakeModule)).toThrow('kebab-case');
    expect(() => definePack(manifest({ tier: 'core' }), FakeModule)).toThrow('tier 必须是');
    expect(() => definePack(manifest({ flag: 'demo_enabled' }), FakeModule)).toThrow('flag');
    expect(() => definePack(manifest({ description: ' ' }), FakeModule)).toThrow('description');
    expect(() =>
      definePack(manifest({ contributes: { ports: 'BILLING_PORT' } }), FakeModule),
    ).toThrow('contributes.ports');
    expect(() => assertPackDefinition({ ...manifest(), module: undefined })).toThrow('module');
    expect(() => assertPackDefinition(null)).toThrow('默认导出');
  });
});

describe('discoverPacks', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function scaffold(packs: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    roots.push(root);
    for (const [dir, source] of Object.entries(packs)) {
      mkdirSync(join(root, dir));
      writeFileSync(join(root, dir, 'pack.js'), source);
    }
    return root;
  }

  it('finds every directory with a pack file, sorted by id, and skips directories without one', () => {
    const root = scaffold({
      zeta: `module.exports = { default: { id: 'zeta', tier: 'feature', description: 'z', flag: 'ZETA_PACK_ENABLED', module: class Zeta {} } };`,
      alpha: `module.exports = { id: 'alpha', tier: 'system', description: 'a', flag: 'ALPHA_PACK_ENABLED', module: class Alpha {} };`,
    });
    mkdirSync(join(root, 'not-a-pack'));
    const packs = discoverPacks({ root });
    expect(packs.map(pack => pack.id)).toEqual(['alpha', 'zeta']);
    expect(packs[0].dir).toBe('alpha');
    expect(typeof packs[1].module).toBe('function');
  });

  it('fails fast on a malformed pack file or an id that does not match the directory', () => {
    const broken = scaffold({
      broken: `module.exports = { default: { id: 'broken', tier: 'system', description: '', flag: 'BROKEN_PACK_ENABLED', module: class Broken {} } };`,
    });
    expect(() => discoverPacks({ root: broken })).toThrow(
      '扩展包 broken 的清单无效：缺少 description',
    );
    const renamed = scaffold({
      moved: `module.exports = { default: { id: 'original', tier: 'system', description: 'x', flag: 'ORIGINAL_PACK_ENABLED', module: class Original {} } };`,
    });
    expect(() => discoverPacks({ root: renamed })).toThrow('必须等于目录名');
  });

  it('returns an empty list when the packs directory does not exist', () => {
    expect(discoverPacks({ root: join(tmpdir(), 'definitely-missing-packs-dir') })).toEqual([]);
  });
});
