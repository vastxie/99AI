import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILE_TRANSFER_SCRIPT } from './file-transfer-script';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterEach: any;

describe('container file transfer program with disposable local fixtures', () => {
  let fixture: string;
  let root: string;
  const transfer = (relative: string, action: string, input = Buffer.alloc(0)) =>
    spawnSync('python3', ['-I', '-c', FILE_TRANSFER_SCRIPT, root, relative, action, '600'], {
      input,
      timeout: 3000,
    });
  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'sandbox-transfer-'));
    root = join(fixture, 'workspace');
    mkdirSync(root);
  });
  afterEach(() => rmSync(fixture, { recursive: true, force: true }));

  it('round-trips binary content, creates parents, sets permissions and truncates replacements', () => {
    const name = "out/a ' ; $(literal).bin";
    const bytes = Buffer.from([0, 255, 10, 13, 65]);
    expect(transfer(name, 'write', bytes).status).toBe(0);
    const read = transfer(name, 'read');
    expect(read.status).toBe(0);
    expect(read.stdout).toEqual(bytes);
    expect(statSync(join(root, name)).mode & 0o777).toBe(0o600);
    expect(transfer(name, 'write').status).toBe(0);
    expect(transfer(name, 'read').stdout).toEqual(Buffer.alloc(0));
  });

  it('refuses both file and parent-directory symlinks without reading or changing their targets', () => {
    const outside = join(fixture, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'kept'), 'original');
    symlinkSync(join(outside, 'kept'), join(root, 'file-link'));
    symlinkSync(outside, join(root, 'dir-link'));
    for (const relative of ['file-link', 'dir-link/kept']) {
      for (const action of ['read', 'write']) {
        const result = transfer(relative, action, Buffer.from('replacement'));
        expect(result.status).toBe(3);
        expect(result.stdout.length).toBe(0);
        expect(result.stderr.length).toBe(0);
      }
    }
    expect(readFileSync(join(outside, 'kept'), 'utf8')).toBe('original');
    expect(transfer('dir-link/nested/new', 'write').status).toBe(3);
    expect(transfer('../outside/kept', 'read').status).toBe(3);
  });

  it('rejects missing files, directories and FIFOs without blocking', () => {
    mkdirSync(join(root, 'directory'));
    expect(spawnSync('mkfifo', [join(root, 'pipe')]).status).toBe(0);
    for (const relative of ['missing', 'directory', 'pipe']) {
      const result = transfer(relative, 'read');
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(3);
    }
    expect(transfer('pipe', 'write').status).toBe(3);
    expect(transfer('directory', 'write').status).toBe(3);
  });
});
