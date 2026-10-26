import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundaryChecks } from '../scripts/check-boundaries.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('root API is exactly eleven experimental exports with no subpaths', () => {
  const result = runBoundaryChecks();
  assert.equal(result.exports.length, 11);
});

test('public API gate rejects an added root export', () => {
  const index = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8');
  assert.throws(
    () =>
      runBoundaryChecks({
        compatibility: false,
        sourceOverrides: {
          'index.ts': `${index}\nexport { LoopDetector } from './loop-detector';\n`,
        },
      }),
    /root exports differ/,
  );
});

test('public API gate rejects a removed experimental marker', () => {
  const contracts = readFileSync(join(packageRoot, 'src/contracts.ts'), 'utf8');
  assert.throws(
    () =>
      runBoundaryChecks({
        compatibility: false,
        sourceOverrides: {
          'contracts.ts': contracts.replace(
            '/** @experimental */\nexport interface AgentRuntimeInput',
            'export interface AgentRuntimeInput',
          ),
        },
      }),
    /AgentRuntimeInput needs one @experimental/,
  );
});

test('public API gate rejects package subpaths and production dependencies', () => {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.throws(
    () =>
      runBoundaryChecks({
        compatibility: false,
        packageJson: {
          ...packageJson,
          exports: {
            ...packageJson.exports,
            './internal': './src/runtime-core.ts',
          },
        },
      }),
    /only the root entry/,
  );
  assert.throws(
    () =>
      runBoundaryChecks({
        compatibility: false,
        packageJson: { ...packageJson, dependencies: { framework: '1.0.0' } },
      }),
    /dependencies must be empty/,
  );
});
