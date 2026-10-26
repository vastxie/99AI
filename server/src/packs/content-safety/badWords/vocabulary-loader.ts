/**
 * 敏感词库懒加载器
 *
 * 运行时要求：
 * - 词库数据由部署者自备（仓库不附带任何词库，见 data/vocabularies/README.md）：UTF-8 文本文件
 *   （一行一个词），存放在 `<service 根目录>/data/vocabularies/<词库名>.txt`，文件名即管理端显示的词库名；
 *   部署时把 `data/` 目录与 `dist/` 一同分发（数据不会被打进 bundle）。
 * - 数据目录按以下顺序解析，取第一个存在的目录：
 *   1. `<process.cwd()>/data/vocabularies`：`nest start` 与 `node dist/main.js` 都要求在 server/ 下执行；
 *   2. `<__dirname>/../data/vocabularies`：rspack 单文件产物 dist/main.js 的兜底；
 *   3. `<__dirname>/../../../data/vocabularies`：tsc 分文件产物 / ts-jest 直接运行源码时的兜底。
 * - 目录或文件不存在时只记录警告并按空词库处理（fail open），绝不会阻断启动。
 *
 * 加载策略：
 * - 只有被选中的词库才会读入内存，并按词库 key 做进程内缓存（相同 key 只读一次磁盘）；
 * - 管理端统计（词数）只缓存数字，不把整张词表常驻内存；
 * - 行归一化规则与历史生成脚本保持一致：trim、去除 \r\n\t、跳过空行与 `#` / `//` 开头的注释行、去重。
 */
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const LOG_CONTEXT = 'VocabularyLoader';
const VOCABULARY_FILE_EXT = '.txt';

/* 单个词库的元信息（管理端 GET /badWords/vocabularies 的 vocabularies[] 元素结构，勿改字段名） */
export interface VocabularyMeta {
  id: string;
  name: string;
  description: string;
  count: number;
}

/* 词库统计信息（管理端 GET /badWords/vocabularies 的 stats 结构，勿改字段名） */
export interface VocabularyStats {
  totalVocabularies: number;
  totalWords: number;
}

export interface VocabularyLoaderOptions {
  /** 显式指定数据目录；指定后不再按候选目录自动解析 */
  dataDir?: string;
  /** 自定义候选目录列表（按顺序取第一个存在的），主要用于测试 */
  candidates?: string[];
}

/* 默认候选数据目录（顺序即优先级，见文件头说明） */
export function getDefaultVocabularyDirCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'data', 'vocabularies'),
    path.resolve(__dirname, '..', 'data', 'vocabularies'),
    path.resolve(__dirname, '..', '..', '..', 'data', 'vocabularies'),
  ];
}

/* 把词库文本归一化为去重后的词集合（规则与历史生成脚本一致） */
export function normalizeVocabularyText(content: string): Set<string> {
  const words = new Set<string>();
  for (const line of content.split('\n')) {
    const word = line.trim().replace(/[\r\n\t]/g, '');
    if (word && !word.startsWith('#') && !word.startsWith('//')) {
      words.add(word);
    }
  }
  return words;
}

/* 词库 key 只能是文件名本身（不含路径分隔符），防止配置值被用作路径穿越 */
export function isValidVocabularyKey(key: unknown): key is string {
  if (typeof key !== 'string' || !key) return false;
  if (key === '.' || key === '..') return false;
  if (key.includes('/') || key.includes('\\') || key.includes('\0')) return false;
  return path.basename(key) === key;
}

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export class VocabularyLoader {
  /** undefined 表示尚未解析；null 表示已解析但没有可用目录 */
  private resolvedDir: string | null | undefined;
  private readonly sets = new Map<string, Promise<Set<string>>>();
  private readonly counts = new Map<string, Promise<number>>();

  constructor(private readonly options: VocabularyLoaderOptions = {}) {}

  /* 解析数据目录：取第一个存在的候选目录；都不存在时记录一次警告并返回 null（fail open） */
  resolveDataDir(): string | null {
    if (this.resolvedDir !== undefined) return this.resolvedDir;

    const candidates = this.options.dataDir
      ? [this.options.dataDir]
      : (this.options.candidates ?? getDefaultVocabularyDirCandidates());
    const found = candidates.find(dir => isDirectory(dir));

    if (!found) {
      Logger.warn(
        `敏感词库目录不存在，本地词库将按空处理。已尝试: ${candidates.join(' | ')}`,
        LOG_CONTEXT,
      );
    }

    this.resolvedDir = found ?? null;
    return this.resolvedDir;
  }

  /* 列出数据目录中所有可用词库的 key（文件名不含扩展名，按 key 排序） */
  async listKeys(): Promise<string[]> {
    const dir = this.resolveDataDir();
    if (!dir) return [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      return entries
        .filter(
          entry =>
            (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(VOCABULARY_FILE_EXT),
        )
        .map(entry => entry.name.slice(0, -VOCABULARY_FILE_EXT.length))
        .sort();
    } catch (error) {
      Logger.warn(`读取敏感词库目录失败，按无词库处理: ${error?.message || error}`, LOG_CONTEXT);
      return [];
    }
  }

  /* 加载单个词库；结果按 key 缓存在进程内，调用方不得修改返回的 Set */
  load(key: string): Promise<Set<string>> {
    if (!isValidVocabularyKey(key)) {
      Logger.warn(`非法的词库标识，已忽略: ${String(key)}`, LOG_CONTEXT);
      return Promise.resolve(new Set<string>());
    }

    let pending = this.sets.get(key);
    if (!pending) {
      pending = this.readSet(key);
      this.sets.set(key, pending);
    }
    return pending;
  }

  /* 统计单个词库的词数；未加载过的词库只缓存数量，不把词表留在内存里 */
  count(key: string): Promise<number> {
    if (!isValidVocabularyKey(key)) return Promise.resolve(0);

    const loaded = this.sets.get(key);
    if (loaded) return loaded.then(set => set.size);

    let pending = this.counts.get(key);
    if (!pending) {
      pending = this.readSet(key).then(set => set.size);
      this.counts.set(key, pending);
    }
    return pending;
  }

  /* 合并多个词库，返回去重后的新 Set；未知 / 非法 key 会被忽略 */
  async merge(keys: string[]): Promise<Set<string>> {
    const merged = new Set<string>();
    for (const key of keys) {
      const words = await this.load(key);
      for (const word of words) {
        merged.add(word);
      }
    }
    return merged;
  }

  /* 管理端展示用的词库元信息列表 */
  async getMeta(): Promise<VocabularyMeta[]> {
    const keys = await this.listKeys();
    return Promise.all(
      keys.map(async id => ({
        id,
        name: id,
        description: `${id}敏感词库`,
        count: await this.count(id),
      })),
    );
  }

  /* 词库总数与总词数（各词库词数之和，不做跨词库去重，与历史统计口径一致） */
  async getStats(): Promise<VocabularyStats> {
    const meta = await this.getMeta();
    return {
      totalVocabularies: meta.length,
      totalWords: meta.reduce((sum, item) => sum + item.count, 0),
    };
  }

  /* 清空进程内缓存并重新解析目录（词库文件更新或配置重载时调用） */
  reset(): void {
    this.sets.clear();
    this.counts.clear();
    this.resolvedDir = undefined;
  }

  private async readSet(key: string): Promise<Set<string>> {
    const dir = this.resolveDataDir();
    if (!dir) return new Set<string>();

    const file = path.join(dir, `${key}${VOCABULARY_FILE_EXT}`);
    try {
      const content = await fs.promises.readFile(file, 'utf8');
      return normalizeVocabularyText(content);
    } catch (error) {
      const reason = error?.code === 'ENOENT' ? '文件不存在' : error?.message || String(error);
      Logger.warn(`敏感词库「${key}」加载失败（${reason}），按空词库处理: ${file}`, LOG_CONTEXT);
      return new Set<string>();
    }
  }
}

/* 进程级默认加载器；服务代码统一通过下面的函数使用它 */
export const vocabularyLoader = new VocabularyLoader();

export function mergeVocabularies(keys: string[]): Promise<Set<string>> {
  return vocabularyLoader.merge(keys);
}

export function getVocabularyMeta(): Promise<VocabularyMeta[]> {
  return vocabularyLoader.getMeta();
}

export function getVocabularyStats(): Promise<VocabularyStats> {
  return vocabularyLoader.getStats();
}

export function resetVocabularyLoader(): void {
  vocabularyLoader.reset();
}
