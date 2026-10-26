import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalSandboxDriver } from './local-sandbox.driver';
import { SandboxPathError, type SandboxHandle } from './sandbox.port';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;
declare const beforeAll: any;
declare const afterAll: any;

const spec = { ownerId: 'user-1', memoryMb: 256, cpus: 1, pidsLimit: 64, networkMode: 'none' };

// 按时间等而不是按事件循环轮数：读写前还有真实的 mkdir / stat，CI 机器慢时一百轮不够
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

describe('LocalSandboxDriver (dev-only, real bash)', () => {
  let root = '';
  let driver: LocalSandboxDriver;
  let handle: SandboxHandle;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sbx-local-'));
    driver = new LocalSandboxDriver(root);
    handle = await driver.ensure(spec);
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('creates the workspace layout and reports running', async () => {
    for (const dir of ['in', 'out', 'artifacts', 'skills']) {
      expect((await fs.stat(path.join(handle.id, dir))).isDirectory()).toBe(true);
    }
    expect(await driver.status(handle)).toBe('running');
  });

  it('runs commands in the workspace', async () => {
    const onDispatch = jest.fn();
    const result = await driver.exec(handle, 'pwd && echo err 1>&2 && printf done', {
      onDispatch,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split('\n')[0]).toBe(await fs.realpath(handle.id));
    expect(result.stdout).toContain('done');
    expect(result.stderr.trim()).toBe('err');
    expect(result.timedOut).toBe(false);
    expect(onDispatch).toHaveBeenCalledTimes(1);
  });

  it('reports which output stream was cut at the capture limit', async () => {
    const handle = await driver.ensure(spec);
    const result = await driver.exec(handle, "printf '%050d' 0; printf 'short' >&2", {
      maxOutputBytes: 10,
    });
    expect(result).toMatchObject({
      truncated: true,
      stdoutTruncated: true,
      stderrTruncated: false,
    });
    expect(result.stderr).toBe('short');
  });

  it('keeps the tail of the output when the caller asks for it', async () => {
    const result = await driver.exec(handle, 'printf 0123456789ABCDEF', {
      maxOutputBytes: 8,
      outputTail: true,
    });
    expect(result.truncated).toBe(true);
    expect(result.stdout).toBe('01\n…（输出超过 8 字节，中间 8 字节未保留）\nABCDEF');
  });

  it('maps env paths under /workspace to the host workspace and leaves other values alone', async () => {
    const result = await driver.exec(
      handle,
      'printf "%s|%s|%s|%s" "$OUT" "$ROOT" "$NEAR" "$PLAIN"',
      {
        env: {
          OUT: '/workspace/out/turn_1',
          ROOT: '/workspace',
          NEAR: '/workspacex/a',
          PLAIN: 'http://proxy:8080',
        },
      },
    );
    expect(result.stdout).toBe(
      `${handle.id}/out/turn_1|${handle.id}|/workspacex/a|http://proxy:8080`,
    );
  });

  it('kills the whole process tree on timeout and on abort', async () => {
    const timedOut = await driver.exec(handle, 'sleep 30; echo late', { timeoutSec: 1 });
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.stdout).not.toContain('late');
    expect(timedOut.durationMs).toBeLessThan(5_000);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const aborted = await driver.exec(handle, 'sleep 30; echo late', { signal: controller.signal });
    expect(aborted.aborted).toBe(true);
    expect(aborted.durationMs).toBeLessThan(5_000);
  });

  it('stops a read or write that is already under way when the signal aborts', async () => {
    await driver.writeFile(handle, 'out/abort.txt', 'hello');
    // 让 fs 调用挂起到收到中止为止，确认中止发生在读写进行中
    const pendingUntilAbort = (...args: unknown[]) => {
      const options = args.at(-1) as { signal: AbortSignal };
      return new Promise<never>((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
        ),
      );
    };
    const readSpy = jest.spyOn(fs, 'readFile').mockImplementation(pendingUntilAbort);
    const writeSpy = jest.spyOn(fs, 'writeFile').mockImplementation(pendingUntilAbort);
    try {
      const reading = new AbortController();
      const read = driver.readFile(handle, 'out/abort.txt', { signal: reading.signal });
      await waitFor(() => readSpy.mock.calls.length === 1);
      reading.abort();
      await expect(read).rejects.toThrow('沙箱文件传输已取消');

      const writing = new AbortController();
      const write = driver.writeFile(handle, 'out/abort.bin', 'bytes', { signal: writing.signal });
      await waitFor(() => writeSpy.mock.calls.length === 1);
      writing.abort();
      await expect(write).rejects.toThrow('沙箱文件传输已取消');

      // 中止与普通文件错误同时出现时，报真实的文件错误
      const racing = new AbortController();
      writeSpy.mockImplementationOnce(async () => {
        racing.abort();
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      });
      await expect(
        driver.writeFile(handle, 'out/eio.bin', 'bytes', { signal: racing.signal }),
      ).rejects.toThrow('EIO');
    } finally {
      readSpy.mockRestore();
      writeSpy.mockRestore();
    }
  });

  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it('returns soon after the main process exits while a background process holds the output', async () => {
    const quick = new LocalSandboxDriver(root, 100);
    const handle = await quick.ensure(spec);
    const started = Date.now();
    const result = await quick.exec(handle, 'sleep 30 & echo $!', { timeoutSec: 20 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result).toMatchObject({ exitCode: 0, outputHeld: true, timedOut: false });
    const pid = Number(result.stdout.trim());
    try {
      // 主进程结束后留下的后台进程不由驱动结束（本地没有容器边界，停机也不结束它们）
      await new Promise(resolve => setTimeout(resolve, 200));
      await quick.stop(handle);
      expect(alive(pid)).toBe(true);
    } finally {
      process.kill(pid, 'SIGKILL');
    }
  });

  it('does not kill the background process at the exec timeout once the main process has exited', async () => {
    const quick = new LocalSandboxDriver(root, 1500);
    const handle = await quick.ensure(spec);
    const result = await quick.exec(handle, 'sleep 30 & echo $!', { timeoutSec: 1 });
    // 主进程很快结束：执行超时被停掉，收尾到期（1.5 秒，晚于 1 秒超时）后返回，不算超时
    expect(result).toMatchObject({ outputHeld: true, timedOut: false, exitCode: 0 });
    const pid = Number(result.stdout.trim());
    try {
      expect(alive(pid)).toBe(true);
    } finally {
      process.kill(pid, 'SIGKILL');
    }
  });

  it('cancelling after the main process exited sends no signal and stops capturing at once', async () => {
    const quick = new LocalSandboxDriver(root, 5_000);
    const handle = await quick.ensure(spec);
    const controller = new AbortController();
    const kill = jest.spyOn(process, 'kill');
    let pid = 0;
    try {
      const running = quick.exec(handle, 'sleep 30 & echo $!', {
        timeoutSec: 20,
        signal: controller.signal,
      });
      // 主进程很快结束、后台进程占着输出：收尾期间取消
      setTimeout(() => controller.abort(), 400);
      const started = Date.now();
      const result = await running;
      pid = Number(result.stdout.trim());
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(result).toMatchObject({
        aborted: true,
        outputHeld: true,
        exitCode: 0,
        timedOut: false,
      });
      expect(kill.mock.calls.some((call: unknown[]) => call[1] === 'SIGKILL')).toBe(false);
      expect(alive(pid)).toBe(true);
    } finally {
      kill.mockRestore();
      if (pid) process.kill(pid, 'SIGKILL');
    }
  });

  it('refuses a command whose signal is already aborted, without starting it', async () => {
    const quick = new LocalSandboxDriver(root, 100);
    const handle = await quick.ensure({ ...spec, ownerId: 'pre-aborted' });
    const controller = new AbortController();
    controller.abort();
    const onDispatch = jest.fn();
    await expect(
      quick.exec(handle, 'touch ran.txt', { signal: controller.signal, onDispatch }),
    ).rejects.toThrow('沙箱命令已取消，未执行');
    expect(onDispatch).not.toHaveBeenCalled();
    await expect(fs.stat(path.join(handle.id, 'ran.txt'))).rejects.toThrow();
  });

  it('reads, writes and lists files inside the workspace only', async () => {
    const onDispatch = jest.fn();
    await driver.writeFile(handle, 'out/nested/hello.txt', 'hello', { onDispatch });
    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect((await driver.readFile(handle, '/workspace/out/nested/hello.txt')).toString()).toBe(
      'hello',
    );
    const entries = await driver.listDir(handle, 'out', { recursive: true });
    expect(entries.map(entry => [entry.path, entry.type])).toEqual(
      expect.arrayContaining([
        ['out/nested', 'dir'],
        ['out/nested/hello.txt', 'file'],
      ]),
    );
    await expect(driver.readFile(handle, 'out/nested/hello.txt', { maxBytes: 2 })).rejects.toThrow(
      '读取上限',
    );

    for (const bad of ['../outside.txt', '/etc/passwd']) {
      await expect(driver.writeFile(handle, bad, 'x')).rejects.toThrow(SandboxPathError);
      await expect(driver.readFile(handle, bad)).rejects.toThrow(SandboxPathError);
    }
  });

  it('refuses to follow symlinks that escape the workspace', async () => {
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'secret');
    await fs.symlink(outside, path.join(handle.id, 'link.txt'));
    await expect(driver.readFile(handle, 'link.txt')).rejects.toThrow(SandboxPathError);
  });

  it('stops and destroys', async () => {
    await driver.stop(handle);
    expect(await driver.status(handle)).toBe('stopped');
    await driver.destroy(handle, { removeWorkspace: true });
    expect(await driver.status(handle)).toBe('missing');
  });

  it('measures only its workspace, counts hard links once and bounds traversal', async () => {
    const resourceHandle = await driver.ensure({ ...spec, ownerId: 'usage-test' });
    await driver.writeFile(resourceHandle, 'out/data.bin', Buffer.alloc(8192, 1));
    const before = await driver.inspectResources(resourceHandle, 100);
    await fs.link(
      path.join(resourceHandle.id, 'out/data.bin'),
      path.join(resourceHandle.id, 'out/alias.bin'),
    );
    const linked = await driver.inspectResources(resourceHandle, 100);
    expect(linked.workspaceInodes).toBe(before.workspaceInodes);
    expect(linked.workspaceBytes).toBeGreaterThanOrEqual(8192);
    expect(linked.freeBytes).toBeGreaterThan(0);
    expect(linked.scanComplete).toBe(true);
    const outside = path.join(root, 'outside-usage');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'huge'), Buffer.alloc(1024 * 1024, 1));
    await fs.symlink(outside, path.join(resourceHandle.id, 'out/external'));
    const symlinked = await driver.inspectResources(resourceHandle, 100);
    expect(symlinked.workspaceBytes - linked.workspaceBytes).toBeLessThan(1024 * 1024);
    expect((await driver.inspectResources(resourceHandle, 2)).scanComplete).toBe(false);
    expect(await driver.verify(resourceHandle, { ...spec, ownerId: 'usage-test' })).toBe('running');
    await expect(
      driver.verify(resourceHandle, { ...spec, ownerId: 'different' }),
    ).rejects.toThrow();
  });
});
