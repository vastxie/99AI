import { resolveWorkspacePath, SandboxPathError, shellQuote } from './sandbox.port';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EXEC_STATE_DIR, OutputCollector, killCommand, wrapCommand } from './exec-support';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('resolveWorkspacePath', () => {
  it('accepts relative and /workspace-prefixed paths and normalizes them', () => {
    expect(resolveWorkspacePath('')).toBe('');
    expect(resolveWorkspacePath('/workspace')).toBe('');
    expect(resolveWorkspacePath('/workspace/')).toBe('');
    expect(resolveWorkspacePath('out/a.png')).toBe('out/a.png');
    expect(resolveWorkspacePath('./out//a.png')).toBe('out/a.png');
    expect(() => resolveWorkspacePath('/workspace/in/../out/b.txt')).toThrow();
  });

  it('rejects escapes, foreign absolute paths and null bytes', () => {
    for (const bad of [
      '/',
      '../etc/passwd',
      '/etc/passwd',
      '/workspacex/a',
      'out/../../x',
      'a\0b',
    ]) {
      expect(() => resolveWorkspacePath(bad)).toThrow(SandboxPathError);
    }
  });
});

describe('exec support', () => {
  it('quotes for bash single-quote context', () => {
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
  });

  it('uses a real pid and fixed commands without loading user shell profiles', () => {
    const wrapped = wrapCommand('abc', 'echo "hi" && ls', 30);
    expect(wrapped).toContain('/tmp/.sbx/abc.pid');
    expect(wrapped).toContain('echo "$$ ${20}"');
    expect(wrapped).toContain('/usr/bin/timeout -s KILL 30s /bin/bash --noprofile --norc -c');
    expect(wrapped).toContain(`'echo "hi" && ls'`);
    expect(wrapped).toContain('/proc/$$/stat');
    expect(killCommand('abc')).toContain('kill -KILL -- -"$pgid"');
  });

  describe('kill command (real bash)', () => {
    // 状态目录与 /proc 换到临时目录（本机不一定有 /proc），系统命令改用 PATH 里的同名命令
    const script = (dir: string, text: string) =>
      text
        .split(EXEC_STATE_DIR)
        .join(`${dir}/state`)
        .split('/proc/')
        .join(`${dir}/proc/`)
        .split('/usr/bin/')
        .join('');
    const runKill = (dir: string, execId: string) =>
      new Promise<void>(resolve =>
        spawn('bash', ['-c', script(dir, killCommand(execId))], { stdio: 'ignore' }).on(
          'exit',
          () => resolve(),
        ),
      );
    const exited = (child: ReturnType<typeof spawn>) =>
      new Promise<NodeJS.Signals | null>(resolve =>
        child.on('exit', (_code, signal) => resolve(signal)),
      );
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const waitGone = async (pid: number) => {
      for (let i = 0; i < 100 && alive(pid); i++) await new Promise(r => setTimeout(r, 10));
      return !alive(pid);
    };
    /** 假的 /proc/<pid>/stat：第 22 项是启动时刻（进程名里带空格和括号也要能解析） */
    const fakeStat = async (dir: string, pid: number, start: string) => {
      await fs.mkdir(path.join(dir, 'proc', String(pid)), { recursive: true });
      const rest = ['S', ...Array.from({ length: 18 }, () => '0'), start, '0'];
      await fs.writeFile(
        path.join(dir, 'proc', String(pid), 'stat'),
        `${pid} (a) b) ${rest.join(' ')}\n`,
      );
    };
    const withDir = async (run: (dir: string) => Promise<void>) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbx-kill-'));
      await fs.mkdir(path.join(dir, 'state'));
      try {
        await run(dir);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    };

    it('waits for a pid file written after the kill was requested and ends the whole group', () =>
      withDir(async dir => {
        const background = path.join(dir, 'background');
        const target = spawn('bash', ['-c', `sleep 30 & echo $! > '${background}'; sleep 30`], {
          detached: true,
          stdio: 'ignore',
        });
        const ended = exited(target);
        const killing = runKill(dir, 'late');
        // 结束请求先到，命令 300 ms 后才写下进程编号与启动时刻
        await new Promise(resolve => setTimeout(resolve, 300));
        await fakeStat(dir, target.pid!, '4242');
        await fs.writeFile(path.join(dir, 'state', 'late.pid'), `${target.pid} 4242\n`);
        expect(await ended).toBe('SIGKILL');
        await killing;
        expect(await waitGone(Number((await fs.readFile(background, 'utf8')).trim()))).toBe(true);
        // 读到编号才删状态文件
        await expect(fs.stat(path.join(dir, 'state', 'late.pid'))).rejects.toThrow();
      }));

    it('ends the process itself when its process group does not exist yet', () =>
      withDir(async dir => {
        // 不是进程组组长（timeout 还没自立进程组时的样子）
        const target = spawn('sleep', ['30'], { stdio: 'ignore' });
        const ended = exited(target);
        await fakeStat(dir, target.pid!, '77');
        await fs.writeFile(path.join(dir, 'state', 'early.pid'), `${target.pid} 77\n`);
        await runKill(dir, 'early');
        expect(await ended).toBe('SIGKILL');
      }));

    it('sends no signal when the recorded number now belongs to another process', () =>
      withDir(async dir => {
        // 编号对应的进程启动时刻对不上：原进程早已结束、编号被复用
        const other = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
        try {
          await fakeStat(dir, other.pid!, '9001');
          await fs.writeFile(path.join(dir, 'state', 'reused.pid'), `${other.pid} 1234\n`);
          await runKill(dir, 'reused');
          expect(alive(other.pid!)).toBe(true);
          await expect(fs.stat(path.join(dir, 'state', 'reused.pid'))).rejects.toThrow();
        } finally {
          other.kill('SIGKILL');
        }
      }));

    it('sends no signal once the recorded leader has exited, nor without a usable identity', () =>
      withDir(async dir => {
        const background = path.join(dir, 'background');
        // 组长写下编号后退出，后台进程留在组里：主进程已经结束，不由结束命令处理
        const leader = spawn('bash', ['-c', `sleep 30 & echo $! > '${background}'`], {
          detached: true,
          stdio: 'ignore',
        });
        await exited(leader);
        const backgroundPid = Number((await fs.readFile(background, 'utf8')).trim());
        try {
          await fs.writeFile(path.join(dir, 'state', 'left.pid'), `${leader.pid} 55\n`);
          await runKill(dir, 'left');
          expect(alive(backgroundPid)).toBe(true);
          await expect(fs.stat(path.join(dir, 'state', 'left.pid'))).rejects.toThrow();

          // 没记下启动时刻（包装时读不到 /proc）：不发信号
          const target = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
          try {
            await fakeStat(dir, target.pid!, '12');
            await fs.writeFile(path.join(dir, 'state', 'blank.pid'), `${target.pid}\n`);
            await runKill(dir, 'blank');
            expect(alive(target.pid!)).toBe(true);
            // 读不到进程状态（权限）：同样不发信号
            await fs.chmod(path.join(dir, 'proc', String(target.pid), 'stat'), 0o000);
            await fs.writeFile(path.join(dir, 'state', 'unreadable.pid'), `${target.pid} 12\n`);
            await runKill(dir, 'unreadable');
            expect(alive(target.pid!)).toBe(true);
          } finally {
            target.kill('SIGKILL');
          }
        } finally {
          process.kill(backgroundPid, 'SIGKILL');
        }
      }));

    (process.platform === 'linux' ? it : it.skip)(
      'records the wrapper pid with the start time from /proc',
      () =>
        withDir(async dir => {
          const wrapped = wrapCommand('own', 'true', 5).split(EXEC_STATE_DIR).join(`${dir}/state`);
          await new Promise(resolve =>
            spawn('bash', ['-c', wrapped], { stdio: 'ignore' }).on('exit', resolve),
          );
          const [pid, start] = (await fs.readFile(path.join(dir, 'state', 'own.pid'), 'utf8'))
            .trim()
            .split(' ');
          expect(Number(pid)).toBeGreaterThan(0);
          expect(start).toMatch(/^\d+$/);
        }),
    );
  });

  it('keeps only the head by default and says where it was cut', () => {
    const collector = new OutputCollector(10);
    collector.push('12345');
    collector.push('');
    expect(collector.truncated).toBe(false);
    collector.push('67890abc');
    collector.push('tail');
    expect(collector.truncated).toBe(true);
    expect(collector.toString()).toBe('1234567890\n…（输出超过 10 字节已截断）');
    // 截断点落在多字节字符中间时保持原样（分页读取按「捕获到的是前缀」计算）
    const cut = new OutputCollector(4);
    cut.push('ab中文');
    expect(Buffer.byteLength(cut.toString().split('\n')[0])).toBe(2 + 3);
  });

  describe('OutputCollector with a kept tail', () => {
    const collect = (maxBytes: number, chunks: Array<string | Buffer>) => {
      const collector = new OutputCollector(maxBytes, true);
      for (const chunk of chunks) collector.push(chunk);
      return collector;
    };

    it('returns the whole output while it fits, even when a character straddles the two windows', () => {
      // 上限 8：开头窗口 2 字节，「中」的 3 个字节跨在开头与结尾两个窗口上
      const collector = collect(8, ['a', Buffer.from('中'), 'bcd']);
      expect(collector.truncated).toBe(false);
      expect(collector.toString()).toBe('a中bcd');
      expect(collect(8, ['12345678']).toString()).toBe('12345678');
    });

    it('keeps a quarter for the head and the rest for the real tail', () => {
      const collector = collect(8, ['0123', '4567', '89AB', 'CDEF']);
      expect(collector.truncated).toBe(true);
      expect(collector.toString()).toBe('01\n…（输出超过 8 字节，中间 8 字节未保留）\nABCDEF');
    });

    it('gives the same result however the output is chunked', () => {
      const text = Array.from({ length: 500 }, (_, i) => `line ${i + 1}\n`).join('');
      const whole = collect(400, [text]).toString();
      const bytes = Buffer.from(text);
      const small = collect(
        400,
        Array.from({ length: Math.ceil(bytes.length / 7) }, (_, i) =>
          bytes.subarray(i * 7, i * 7 + 7),
        ),
      );
      expect(small.toString()).toBe(whole);
      expect(whole.startsWith('line 1\n')).toBe(true);
      expect(whole.endsWith('line 500\n')).toBe(true);
      expect(whole).toContain(`…（输出超过 400 字节，中间 ${bytes.length - 400} 字节未保留）`);
    });

    it('never keeps a reference to the chunks it was given', () => {
      // 上限 8 字节，喂进去一个 4 MiB 的块：留下的头尾必须是自己的副本，不能连带占住这一整块
      const big = Buffer.alloc(4 * 1024 * 1024, 0x61);
      for (const keepTail of [false, true]) {
        const collector = new OutputCollector(8, keepTail);
        collector.push(big);
        collector.push(big.subarray(0, 3));
        const held = [...(collector as any).head, ...(collector as any).tail] as Buffer[];
        expect(held.length).toBeGreaterThan(0);
        for (const buffer of held) {
          expect(buffer.buffer).not.toBe(big.buffer);
          // 小块副本来自 Node 的共享小缓冲池，大小与喂进来的块无关
          expect(buffer.buffer.byteLength).toBeLessThan(big.length / 8);
        }
        expect(collector.truncated).toBe(true);
      }
    });

    it('cuts both windows on character boundaries and counts the bytes it gave up', () => {
      // 上限 16：开头 4 字节会切在「好」（3 字节）中间，结尾 12 字节会从 😀（4 字节）中间开始
      const text = '你好世界😀😀😀尾';
      const result = collect(16, [text]).toString();
      expect(result).not.toContain('�');
      const [head, note, tail] = result.split('\n');
      expect(head).toBe('你');
      expect(tail).toBe('😀😀尾');
      const kept = Buffer.byteLength(head) + Buffer.byteLength(tail);
      expect(note).toBe(`…（输出超过 16 字节，中间 ${Buffer.byteLength(text) - kept} 字节未保留）`);
    });
  });
});
