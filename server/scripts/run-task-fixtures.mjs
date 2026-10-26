import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(resolve(serviceRoot, 'task-fixtures/manifest.json'), 'utf8'),
);
assert.equal(manifest.version, 1);
assert.equal(manifest.mode, 'offline');
assert.ok(Array.isArray(manifest.samples) && manifest.samples.length >= 6);
const ids = new Set();
const files = new Set();
for (const sample of manifest.samples) {
  assert.equal(typeof sample.id, 'string');
  assert.ok(!ids.has(sample.id), 'fixture ids must be unique');
  assert.match(sample.testFile, /^src\/modules\/[a-zA-Z0-9_./-]+\.spec\.ts$/);
  assert.ok(!sample.testFile.includes('..'));
  assert.ok(existsSync(resolve(serviceRoot, sample.testFile)));
  assert.ok(Array.isArray(sample.checks) && sample.checks.length > 0);
  ids.add(sample.id);
  files.add(sample.testFile);
  process.stdout.write(`${sample.id}: ${sample.task}\n`);
}
const result = spawnSync(process.execPath, ['scripts/run-jest.js', '--runInBand', ...files], {
  cwd: serviceRoot,
  stdio: 'inherit',
});
if (result.error) process.stderr.write('离线任务验证进程未能启动。\n');
process.exitCode = result.status ?? 1;
