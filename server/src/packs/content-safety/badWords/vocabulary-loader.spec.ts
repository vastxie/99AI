import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  VocabularyLoader,
  getDefaultVocabularyDirCandidates,
  isValidVocabularyKey,
  normalizeVocabularyText,
  vocabularyLoader,
} from './vocabulary-loader';

declare const afterEach: any;
declare const beforeEach: any;
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

const tmpDirs: string[] = [];

function makeDataDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-loader-'));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

function missingDir(): string {
  return path.join(os.tmpdir(), `vocab-loader-missing-${process.pid}-${Date.now()}`);
}

describe('normalizeVocabularyText', () => {
  it('trims, strips CR/tab, skips blank and comment lines, and dedupes', () => {
    const text = '﻿ 词一 \r\n词二\t\n\n   \n# 注释行\n// 注释行\n词一\n词 三\r\n';

    expect([...normalizeVocabularyText(text)]).toEqual(['词一', '词二', '词 三']);
  });
});

describe('isValidVocabularyKey', () => {
  it('accepts plain file names and rejects path-like or empty keys', () => {
    expect(isValidVocabularyKey('广告词-v2')).toBe(true);
    expect(isValidVocabularyKey('2026 补充词库')).toBe(true);

    expect(isValidVocabularyKey('')).toBe(false);
    expect(isValidVocabularyKey('.')).toBe(false);
    expect(isValidVocabularyKey('..')).toBe(false);
    expect(isValidVocabularyKey('../etc/passwd')).toBe(false);
    expect(isValidVocabularyKey('a/b')).toBe(false);
    expect(isValidVocabularyKey('a\\b')).toBe(false);
    expect(isValidVocabularyKey(42)).toBe(false);
    expect(isValidVocabularyKey(null)).toBe(false);
  });
});

describe('VocabularyLoader', () => {
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger, 'warn').mockImplementation((): void => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    while (tmpDirs.length) {
      fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('lists keys sorted and loads normalized word sets from the data directory', async () => {
    const dir = makeDataDir({
      '色情词库.txt': '词A\n词B\n\n词A\n',
      '暴恐词库.txt': ' 词C \r\n# 注释\n',
      'notes.md': 'ignored',
    });
    const loader = new VocabularyLoader({ dataDir: dir });

    await expect(loader.listKeys()).resolves.toEqual(['暴恐词库', '色情词库']);
    await expect(loader.load('色情词库')).resolves.toEqual(new Set(['词A', '词B']));
    await expect(loader.load('暴恐词库')).resolves.toEqual(new Set(['词C']));
    await expect(loader.count('色情词库')).resolves.toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('caches per key until reset', async () => {
    const dir = makeDataDir({ '词库.txt': '旧词\n' });
    const loader = new VocabularyLoader({ dataDir: dir });

    const first = await loader.load('词库');
    expect(first).toEqual(new Set(['旧词']));

    fs.writeFileSync(path.join(dir, '词库.txt'), '新词\n', 'utf8');

    // 未 reset 前命中进程内缓存（同一实例）
    const second = await loader.load('词库');
    expect(second).toBe(first);
    await expect(loader.count('词库')).resolves.toBe(1);

    loader.reset();
    await expect(loader.load('词库')).resolves.toEqual(new Set(['新词']));
  });

  it('fails open when the data directory does not exist', async () => {
    const dir = missingDir();
    const loader = new VocabularyLoader({ dataDir: dir });

    expect(loader.resolveDataDir()).toBeNull();
    await expect(loader.listKeys()).resolves.toEqual([]);
    await expect(loader.load('色情词库')).resolves.toEqual(new Set());
    await expect(loader.merge(['色情词库'])).resolves.toEqual(new Set());
    await expect(loader.getMeta()).resolves.toEqual([]);
    await expect(loader.getStats()).resolves.toEqual({ totalVocabularies: 0, totalWords: 0 });

    // 目录缺失只警告一次
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('敏感词库目录不存在');
    expect(warnSpy.mock.calls[0][0]).toContain(dir);
  });

  it('fails open for a missing file inside an existing directory and for invalid keys', async () => {
    const dir = makeDataDir({ '色情词库.txt': '词A\n' });
    const loader = new VocabularyLoader({ dataDir: dir });

    await expect(loader.load('不存在的词库')).resolves.toEqual(new Set());
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('不存在的词库');

    await expect(loader.load('../色情词库')).resolves.toEqual(new Set());
    await expect(loader.count('../色情词库')).resolves.toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[1][0]).toContain('非法的词库标识');

    await expect(loader.merge(['色情词库', '不存在的词库', '../色情词库'])).resolves.toEqual(
      new Set(['词A']),
    );
  });

  it('picks the first existing candidate directory', () => {
    const existing = makeDataDir({ '词库.txt': '词\n' });
    const loader = new VocabularyLoader({ candidates: [missingDir(), existing, missingDir()] });

    expect(loader.resolveDataDir()).toBe(existing);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('exposes admin meta named after the files, skips non-.txt files, and aggregates stats', async () => {
    const dir = makeDataDir({
      '广告词.txt': '词A\n词B\n词C\n',
      '自定义.txt': '词D\n词D\n',
      'README.md': '# 说明\n',
    });
    const loader = new VocabularyLoader({ dataDir: dir });

    await expect(loader.getMeta()).resolves.toEqual([
      {
        id: '广告词',
        name: '广告词',
        description: '广告词敏感词库',
        count: 3,
      },
      {
        id: '自定义',
        name: '自定义',
        description: '自定义敏感词库',
        count: 1,
      },
    ]);
    await expect(loader.getStats()).resolves.toEqual({ totalVocabularies: 2, totalWords: 4 });
  });

  it('merges selected vocabularies into a new deduplicated set', async () => {
    const dir = makeDataDir({
      'a.txt': '词一\n词二\n',
      'b.txt': '词二\n词三\n',
    });
    const loader = new VocabularyLoader({ dataDir: dir });

    const merged = await loader.merge(['a', 'b', 'a']);
    expect(merged).toEqual(new Set(['词一', '词二', '词三']));

    merged.add('额外');
    await expect(loader.load('a')).resolves.toEqual(new Set(['词一', '词二']));
  });

  it('default loader resolves the repository data directory without depending on its contents', async () => {
    expect(getDefaultVocabularyDirCandidates()).toHaveLength(3);

    // 仓库只跟踪目录说明文件，词库由部署者自备：只断言目录可解析，不断言里面有哪些词库
    const dir = vocabularyLoader.resolveDataDir();
    expect(dir).toBeTruthy();
    expect(dir!.endsWith(path.join('data', 'vocabularies'))).toBe(true);
    await expect(vocabularyLoader.listKeys()).resolves.toEqual(expect.any(Array));
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
