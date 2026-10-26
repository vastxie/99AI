// 用户磁盘助手的故障注入测试：source 助手脚本后用 shell 函数替换外部命令，只验证失败路径的数据安全。
// 不需要 root、loop 设备或 Docker；真实挂载由 smoke 的 gvisor job 与宿主机验收覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const helper = new URL('./99agent-sandbox-disk', import.meta.url).pathname;
const KEY = 'a'.repeat(32);

function run(body, root) {
  const script = `
set -euo pipefail
source ${JSON.stringify(helper)}
set +e
DISK_ROOT=${JSON.stringify(join(root, 'disks'))}
BACKUP_DIR=${JSON.stringify(join(root, 'backups'))}
SITE="$DISK_ROOT/site"
# 替换需要 root / Linux 的外部命令
is_mounted() { return 1; }
require_host_space() { :; }
safe_dir() { mkdir -p "$1"; }
prepare_backup_root() { mkdir -p "$BACKUP_DIR"; }
prepare_instance() { SITE="$DISK_ROOT/$1"; }
flock() { return 0; }
stat() { echo '8 * 512'; }
sync() { :; }
${body}
`;
  return spawnSync('bash', ['-c', script], { encoding: 'utf8' });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sandbox-disk-helper-'));
  const site = join(root, 'disks', 'site');
  mkdirSync(join(site, 'images'), { recursive: true });
  mkdirSync(join(site, 'locks'), { recursive: true });
  const backups = join(root, 'backups', 'site', KEY);
  mkdirSync(backups, { recursive: true });
  const old = ['20260901T000000Z.img', '20260902T000000Z.img', '20260903T000000Z.img'];
  for (const [index, name] of old.entries()) {
    writeFileSync(join(backups, name), `backup ${index}`);
    utimesSync(join(backups, name), new Date('2026-09-03'), new Date('2026-09-03'));
  }
  writeFileSync(join(site, 'images', `${KEY}.img`), 'current disk');
  return { root, backups, old };
}

test('a failed copy keeps every previous backup and reports failure', () => {
  const { root, backups, old } = fixture();
  try {
    const result = run(
      `loop_attached() { return 1; }
cp() { return 1; }
if backup_one site ${KEY}; then echo "rc=0"; else echo "rc=$?"; fi`,
      root,
    );
    assert.match(result.stdout, /rc=1/);
    assert.deepEqual(readdirSync(backups).sort(), old);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed rename discards the partial copy and keeps the old backups', () => {
  const { root, backups, old } = fixture();
  try {
    const result = run(
      `loop_attached() { return 1; }
cp() { command cp "\${@: -2:1}" "\${@: -1}"; }
mv() { return 1; }
if backup_one site ${KEY}; then echo "rc=0"; else echo "rc=$?"; fi`,
      root,
    );
    assert.match(result.stdout, /rc=1/);
    assert.deepEqual(readdirSync(backups).sort(), old);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed sync discards the partial copy and keeps the old backups', () => {
  const { root, backups, old } = fixture();
  try {
    const result = run(
      `loop_attached() { return 1; }
cp() { command cp "\${@: -2:1}" "\${@: -1}"; }
sync() { return 1; }
if backup_one site ${KEY}; then echo "rc=0"; else echo "rc=$?"; fi`,
      root,
    );
    assert.match(result.stdout, /rc=1/);
    assert.deepEqual(readdirSync(backups).sort(), old);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a successful copy rotates old backups and a failed rotation is reported', () => {
  const { root, backups, old } = fixture();
  try {
    const rotated = run(
      `loop_attached() { return 1; }
cp() { command cp "\${@: -2:1}" "\${@: -1}"; }
head() { if [ "$1" = -n ] && [ "\${2#-}" != "$2" ]; then local keep="\${2#-}" lines=(); mapfile -t lines; local n=$((\${#lines[@]} - keep)) i; for ((i = 0; i < n; i++)); do printf '%s\\n' "\${lines[i]}"; done; else command head "$@"; fi; }
if backup_one site ${KEY}; then echo "rc=0"; else echo "rc=$?"; fi`,
      root,
    );
    assert.match(rotated.stdout, /rc=0/, rotated.stderr);
    const kept = readdirSync(backups).sort();
    assert.equal(kept.length, 3);
    assert.ok(!kept.includes(old[0]));

    writeFileSync(join(root, 'disks', 'site', 'images', `${KEY}.img`), 'changed again');
    utimesSync(join(root, 'disks', 'site', 'images', `${KEY}.img`), new Date(), new Date(Date.now() + 60_000));
    const failed = run(
      `loop_attached() { return 1; }
cp() { command cp "\${@: -2:1}" "\${@: -1}"; }
date() { echo 20991231T000000Z; }
head() { if [ "$1" = -n ] && [ "\${2#-}" != "$2" ]; then local keep="\${2#-}" lines=(); mapfile -t lines; local n=$((\${#lines[@]} - keep)) i; for ((i = 0; i < n; i++)); do printf '%s\\n' "\${lines[i]}"; done; else command head "$@"; fi; }
rm() { if [[ "$*" == *.img ]]; then return 1; fi; command rm "$@"; }
if backup_one site ${KEY}; then echo "rc=0"; else echo "rc=$?"; fi`,
      root,
    );
    assert.match(failed.stdout, /rc=1/);
    assert.match(failed.stderr, /rotate/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup exits with 4 when any disk fails, even if others are stale', () => {
  const { root } = fixture();
  try {
    const result = run(
      `loop_attached() { return 1; }
cp() { return 1; }
backup_all
echo "rc=$?"`,
      root,
    );
    assert.equal(result.status, 4, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`fail site ${KEY}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failing loop query is never treated as detached', () => {
  const { root, backups, old } = fixture();
  try {
    const failing = `losetup() { return 1; }`;
    const wait = run(`${failing}\n(wait_detached /x/image.img); echo "rc=$?"`, root);
    assert.match(wait.stdout, /rc=1/);
    assert.match(wait.stderr, /无法查询磁盘的 loop 关联/);
    const backup = run(
      `${failing}
cp() { command cp "\${@: -2:1}" "\${@: -1}"; }
(backup_one site ${KEY}); echo "rc=$?"`,
      root,
    );
    assert.match(backup.stdout, /rc=1/);
    assert.deepEqual(readdirSync(backups).sort(), old);
    const attached = run(
      `losetup() { echo "/dev/loop3: []: (/x/image.img)"; }
sleep() { :; }
(wait_detached /x/image.img); echo "rc=$?"`,
      root,
    );
    assert.match(attached.stdout, /rc=16/);
    assert.match(attached.stderr, /磁盘仍被占用/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
