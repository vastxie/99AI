import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { SandboxDiskManager } from './sandbox-disk';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;
declare const afterEach: any;

const ROOT = '/var/lib/99agent/sandbox-disks';
const COMMAND = '/usr/local/sbin/99agent-sandbox-disk';

function manager(run: any, overrides: Record<string, unknown> = {}) {
  return new SandboxDiskManager({
    root: ROOT,
    command: COMMAND,
    instance: '99agent-sbx-',
    hostMinFreeBytes: 10 * 1024 ** 3,
    useSudo: true,
    run,
    ...overrides,
  });
}

function statfs(values: Partial<Record<string, number>>) {
  return { type: 0, bsize: 4096, blocks: 0, bfree: 0, bavail: 0, files: 0, ffree: 0, ...values };
}

describe('SandboxDiskManager', () => {
  afterEach(() => jest.restoreAllMocks());

  it('derives a per-site key and workspace path that match the host helper', () => {
    const disks = manager(jest.fn());
    const key = createHash('sha256').update('99agent-sbx-\0user-42').digest('hex').slice(0, 32);
    expect(disks.key('user-42')).toBe(key);
    expect(disks.workspacePath('user-42')).toBe(`${ROOT}/99agent-sbx-/mnt/${key}/workspace`);
    expect(manager(jest.fn(), { instance: 'other-site' }).key('user-42')).not.toBe(key);
  });

  it('mounts through sudo with an argument array and rejects a mismatched path', async () => {
    const disks = manager(jest.fn());
    const run = jest.fn(async () => `${disks.workspacePath('user-42')}\n`);
    const withRun = manager(run);
    await expect(withRun.ensure('user-42', 4096 * 1024 ** 2 + 1)).resolves.toBe(
      disks.workspacePath('user-42'),
    );
    expect(run).toHaveBeenCalledWith('/usr/bin/sudo', [
      '-n',
      COMMAND,
      'ensure',
      '99agent-sbx-',
      disks.key('user-42'),
      '4097',
    ]);
    await withRun.ensure('user-42', 1);
    expect(run.mock.calls[1][1].at(-1)).toBe('64');
    run.mockResolvedValueOnce(`${ROOT}/99agent-sbx-/mnt/${'f'.repeat(32)}/workspace\n`);
    await expect(withRun.ensure('user-42', 1024 ** 3)).rejects.toThrow('沙箱磁盘操作失败');
  });

  it('runs the helper directly as root and hides helper failures behind a static message', async () => {
    const run = jest.fn(async () => {
      throw new Error('mount: /secret/path failed');
    });
    const disks = manager(run, { useSudo: false });
    await expect(disks.release('user-42')).rejects.toThrow('沙箱磁盘操作失败');
    expect(run).toHaveBeenCalledWith(COMMAND, ['release', '99agent-sbx-', disks.key('user-42')]);
    await expect(disks.releaseKey('../x')).rejects.toThrow('沙箱磁盘操作失败');
  });

  it('keeps only well-formed keys from list-mounted', async () => {
    const run = jest.fn(async () => `${'a'.repeat(32)}\n../../etc\n\n${'b'.repeat(32)}\n`);
    await expect(manager(run).listMounted()).resolves.toEqual(['a'.repeat(32), 'b'.repeat(32)]);
    expect(run).toHaveBeenCalledWith('/usr/bin/sudo', [
      '-n',
      COMMAND,
      'list-mounted',
      '99agent-sbx-',
    ]);
  });

  it('reads usage from the file system and flags a low host disk', async () => {
    const disks = manager(jest.fn());
    jest
      .spyOn(fs, 'statfs')
      .mockImplementation(async (target: any) =>
        String(target).endsWith('/workspace')
          ? statfs({ blocks: 1000, bfree: 400, bavail: 400, files: 500, ffree: 300 })
          : statfs({ blocks: 90_000_000, bavail: 1000 }),
      );
    await expect(disks.usage('user-42')).resolves.toEqual({
      workspaceBytes: 600 * 4096,
      workspaceInodes: 200,
      freeBytes: 400 * 4096,
      freeInodes: 300,
      scanComplete: true,
      hostLow: true,
    });
  });

  it('refuses usage when the workspace is not on its own file system', async () => {
    const disks = manager(jest.fn());
    jest.spyOn(fs, 'statfs').mockResolvedValue(statfs({ blocks: 5000, bavail: 5000 }) as any);
    await expect(disks.usage('user-42')).rejects.toThrow('沙箱磁盘操作失败');
  });

  it('falls back to the helper when the mount point is not readable by this process', async () => {
    jest
      .spyOn(fs, 'statfs')
      .mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const run = jest.fn(async () => '4096 1000 400 400 500 300 4096 99999999\n');
    await expect(manager(run).usage('user-42')).resolves.toMatchObject({
      workspaceBytes: 600 * 4096,
      hostLow: false,
    });
    run.mockResolvedValueOnce('garbage');
    await expect(manager(run).usage('user-42')).rejects.toThrow('沙箱磁盘操作失败');
    jest
      .spyOn(fs, 'statfs')
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await expect(manager(run).usage('user-42')).rejects.toThrow('沙箱磁盘操作失败');
  });

  it('validates its configuration', () => {
    expect(() => manager(jest.fn(), { root: 'relative/disks' })).toThrow('绝对路径');
    expect(() => manager(jest.fn(), { root: '/srv/disks/../etc' })).toThrow('绝对路径');
    expect(() => manager(jest.fn(), { command: 'sandbox-disk' })).toThrow('绝对路径');
    expect(() => manager(jest.fn(), { instance: '.hidden' })).toThrow('SANDBOX_NAME_PREFIX');
  });
});
