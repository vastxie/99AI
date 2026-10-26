/**
 * 沙箱技能：私有技能的保存 / 删除 / 恢复、站点技能复制，以及写进系统提示的技能索引。
 * 每个沙箱只恢复与复制一次（同一记录）；沙箱换代时由 forget() 清掉记录与索引缓存。
 * 持久磁盘上已存在的技能目录不覆盖：用户可能改过还没保存。
 */

import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { SITE_SKILLS_ENV } from '@/common/constants/site-skills.constant';
import type { FileAssetService } from '../../fileAsset/fileAsset.service';
import type { SandboxService } from '../../sandbox/sandbox.service';
import { SANDBOX_SKILLS_DIR, shellQuote } from '../../sandbox/sandbox.port';
import { PrimitiveInputError, type OwnerRef } from './primitive-types';
import {
  decodeSkillPackage,
  encodeSkillPackage,
  skillName,
  skillSourcePath,
  SKILL_MANIFEST_SCRIPT,
} from './skill-package';

const LOG_CONTEXT = 'PrimitiveTools';
type SkillState = 'present' | 'incomplete';
const SKILL_INDEX_TTL_MS = 60_000;
/** 建索引时读取 SKILL.md 的上限：与站点技能单文件复制上限一致，常见公开技能的说明有几十 KB */
const SKILL_FILE_MAX_BYTES = 2 * 1024 * 1024;
/** 索引里每个技能描述的长度上限：描述进入系统提示，不能被单个技能撑大 */
const SKILL_DESCRIPTION_MAX_CHARS = 1024;

/** 技能安装进行中的标记：目录里有它说明是本服务没装完的技能，下一轮继续补齐（从不删除、从不覆盖） */
const INSTALL_MARKER = '.99agent-installing';
/** 技能文件先写到这个后缀的临时名，完整后再用硬链接挂到正式名 */
const PART_SUFFIX = '.99agent-part';

/**
 * 把完整写好的临时文件用 link(2) 挂到正式名：正式名已存在（目录、文件或链接）时内核返回 EEXIST，
 * 保留原有内容；无论成败都删掉临时文件。只用普通 link / unlink，gVisor 的共享绑定挂载也支持。
 */
const LINK_NOREPLACE_SCRIPT = `# agent_link_noreplace
import os, sys
failed = False
pairs = sys.argv[1:]
for index in range(0, len(pairs), 2):
    part, final = pairs[index], pairs[index + 1]
    try:
        os.link(part, final)
    except FileExistsError:
        pass
    except OSError:
        failed = True
    try:
        os.unlink(part)
    except FileNotFoundError:
        pass
    except OSError:
        failed = True
sys.exit(1 if failed else 0)
`;

export class SkillLibrary {
  private readonly indexCache = new Map<string, { at: number; text: string }>();
  /** 本沙箱已恢复私有技能并复制过站点技能的 owner（进程内一次） */
  private readonly prepared = new Set<string>();
  /** 同一台沙箱的多个对话同时开轮时合并为一次准备 */
  private readonly preparing = new Map<string, Promise<void>>();

  constructor(
    private readonly sandbox: SandboxService,
    private readonly fileAssets: FileAssetService,
  ) {}

  /** 沙箱换代：下一轮重新恢复与复制，技能索引重新读取 */
  forget(ownerId: string): void {
    this.prepared.delete(ownerId);
    this.indexCache.delete(ownerId);
  }

  /** 新沙箱的第一轮：先恢复用户私有保存的技能，再复制站点技能（不覆盖同名） */
  async prepare(owner: OwnerRef): Promise<void> {
    if (this.prepared.has(owner.ownerId)) return;
    const running = this.preparing.get(owner.ownerId);
    if (running) return running;
    const task = (async () => {
      // 私有技能没恢复完时不复制站点技能：同名站点版本会占住目录，之后就再也恢复不了私有版本
      if (!(await this.restore(owner))) return;
      // 没能确认或完成复制时不记为已准备，下一轮重试，也绝不覆盖
      if (await this.seedSiteSkills(owner.ownerId)) this.prepared.add(owner.ownerId);
    })();
    this.preparing.set(owner.ownerId, task);
    try {
      await task;
    } finally {
      if (this.preparing.get(owner.ownerId) === task) this.preparing.delete(owner.ownerId);
    }
  }

  async manage(
    owner: OwnerRef,
    args: Record<string, unknown>,
    persistent = false,
  ): Promise<string> {
    if (!owner.userId) throw new PrimitiveInputError('访客可临时使用技能；长期保留需要登录');
    if (args.delete_skill !== undefined) {
      const name = skillName(args.delete_skill);
      await this.fileAssets.deleteSandboxSkill(owner.userId, name);
      return persistent
        ? `已删除技能 ${name} 的保存副本；工作区里的 skills/${name}/ 仍在，需要时可直接删除该目录。`
        : `已删除技能 ${name} 的持久副本；当前临时目录到期回收。`;
    }
    const name = skillName(args.save_skill);
    const manifest = await this.sandbox.exec(
      owner.ownerId,
      `/usr/bin/python3 -I -c ${shellQuote(SKILL_MANIFEST_SCRIPT)} ${shellQuote(name)}`,
      { maxOutputBytes: 64 * 1024, timeoutSec: 30 },
    );
    if (manifest.exitCode || manifest.aborted || manifest.timedOut || manifest.truncated)
      throw new PrimitiveInputError('技能源码检查失败：请移除链接、凭据、任务文件或过大的内容');
    const entries: Array<{ path: string; sha256: string }> = JSON.parse(manifest.stdout);
    if (!Array.isArray(entries) || entries.length > 100)
      throw new PrimitiveInputError('技能文件数量超限');
    const files = [];
    for (const entry of entries) {
      const relative = skillSourcePath(entry.path);
      const buffer = await this.sandbox.readFile(owner.ownerId, `skills/${name}/${relative}`, {
        maxBytes: 256 * 1024,
      });
      if (createHash('sha256').update(buffer).digest('hex') !== entry.sha256)
        throw new PrimitiveInputError('技能文件在保存时发生变化，请重试');
      files.push({ path: relative, content: buffer.toString('base64'), sha256: entry.sha256 });
    }
    const saved = await this.fileAssets.saveSandboxSkill(
      owner.userId,
      name,
      encodeSkillPackage(name, files),
    );
    return `技能 ${name} 已私有保存（${saved.fileId}），新环境会恢复源码；依赖需按说明重新安装。`;
  }

  /** 返回 false 表示没能确认工作区状态、本轮未恢复 */
  private async restore(owner: OwnerRef): Promise<boolean> {
    if (!owner.userId) return true;
    const current = await this.fileAssets.listSandboxSkills(owner.userId);
    if (!current.length) return true;
    // 已有同名技能（哪怕缺 SKILL.md）就不覆盖：持久磁盘上用户可能改过还没保存；探测失败则本轮不恢复
    const states = await this.probeSkills(
      owner.ownerId,
      current.map(item => skillName(item.metadata?.skillName)),
    );
    if (!states) return false;
    const handled = new Set<string>();
    for (const item of current) {
      const name = skillName(item.metadata?.skillName);
      if (handled.has(name)) continue;
      handled.add(name);
      if (states.get(name) === 'present') continue;
      const [file] = await this.fileAssets.readFilesForRuntime({
        userId: owner.userId,
        fileIds: [item.fileId],
        maxFileSizeMb: 3,
        maxFiles: 1,
      });
      const bundle = decodeSkillPackage(file.buffer);
      if (bundle.name !== name) throw new PrimitiveInputError('技能包身份不匹配');
      if (await this.installSkill(owner.ownerId, name, states.get(name), bundle.files))
        this.indexCache.delete(owner.ownerId);
    }
    return true;
  }

  /**
   * 安装一个技能且绝不覆盖、绝不删除已有内容：mkdir 原子占位（目录已存在即失败，检查与占位是同一个
   * 系统调用），占位后先写安装标记；每个文件先写到临时名，再用 link(2) 挂到正式名（已存在即保留原文件），
   * SKILL.md 最后挂上，全部成功再删标记。正式文件要么是本服务完整写好的，要么是原本就有的，所以中途
   * 失败后下一轮照同样流程补齐也不会覆盖用户改过的文件；技能索引不收录带标记的目录。
   * 返回 false 表示目标已被占用、未安装。
   */
  private async installSkill(
    ownerId: string,
    name: string,
    state: SkillState | undefined,
    files: Array<{ path: string; buffer: Buffer }>,
  ): Promise<boolean> {
    const target = shellQuote(`${SANDBOX_SKILLS_DIR}/${name}`);
    const marker = shellQuote(`${SANDBOX_SKILLS_DIR}/${name}/${INSTALL_MARKER}`);
    const run = async (command: string): Promise<number> => {
      const result = await this.sandbox.exec(ownerId, command, {
        timeoutSec: 30,
        maxOutputBytes: 4096,
      });
      if (result.aborted || result.timedOut) throw new PrimitiveInputError('技能写入沙箱失败');
      return result.exitCode;
    };
    if (state !== 'incomplete') {
      const claimed = await run(
        `if ! /bin/mkdir -- ${target} 2>/dev/null; then if [ -e ${target} ] || [ -L ${target} ]; then exit 3; fi; exit 1; fi; : > ${marker} || { /bin/rmdir -- ${target}; exit 1; }`,
      );
      // 目标已存在（用户或另一个对话刚建的）：不覆盖
      if (claimed === 3) return false;
      if (claimed !== 0) throw new PrimitiveInputError('技能写入沙箱失败');
    }
    const ordered = [
      ...files.filter(file => file.path !== 'SKILL.md'),
      ...files.filter(file => file.path === 'SKILL.md'),
    ].filter(file => !/[\n\0]/u.test(file.path) && !file.path.endsWith(PART_SUFFIX));
    // 先删掉可能残留的临时名：若上一轮链接成功后没删成，它和正式名是同一个 inode，重写临时名会连带改写
    // 正式文件（可能已被用户修改）。删的只是名字，正式文件内容不受影响
    const parts = ordered.map(file =>
      shellQuote(`${SANDBOX_SKILLS_DIR}/${name}/${file.path}${PART_SUFFIX}`),
    );
    if (parts.length && (await run(`/bin/rm -f -- ${parts.join(' ')}`)) !== 0)
      throw new PrimitiveInputError('技能写入沙箱失败');
    const pairs: string[] = [];
    for (const file of ordered) {
      const final = `${SANDBOX_SKILLS_DIR}/${name}/${file.path}`;
      await this.sandbox.writeFile(ownerId, `${final}${PART_SUFFIX}`, file.buffer);
      pairs.push(shellQuote(`${final}${PART_SUFFIX}`), shellQuote(final));
    }
    if (
      pairs.length &&
      (await run(
        `/usr/bin/python3 -I -c ${shellQuote(LINK_NOREPLACE_SCRIPT)} ${pairs.join(' ')}`,
      )) !== 0
    )
      throw new PrimitiveInputError('技能写入沙箱失败');
    if ((await run(`/bin/rm -f -- ${marker}`)) !== 0)
      throw new PrimitiveInputError('技能写入沙箱失败');
    return true;
  }

  /**
   * 逐个探测 skills/<name>：带安装标记为 incomplete，其余存在（目录、文件或链接）为 present，不存在不列出。
   * 不依赖会截断的目录列举；命令失败、超时或输出被截断时返回 undefined，调用方本轮跳过、不覆盖。
   */
  private async probeSkills(
    ownerId: string,
    names: string[],
  ): Promise<Map<string, SkillState> | undefined> {
    const candidates = [...new Set(names)].filter(name => name && !/[/\n\t\0]/u.test(name));
    if (!candidates.length) return new Map();
    try {
      const result = await this.sandbox.exec(
        ownerId,
        `for name in ${candidates.map(name => shellQuote(name)).join(' ')}; do path="${SANDBOX_SKILLS_DIR}/$name"; if [ -e "$path/${INSTALL_MARKER}" ]; then printf 'incomplete\\t%s\\n' "$name"; elif [ -e "$path" ] || [ -L "$path" ]; then printf 'present\\t%s\\n' "$name"; fi; done`,
        { timeoutSec: 30, maxOutputBytes: 64 * 1024 },
      );
      if (result.exitCode !== 0 || result.timedOut || result.aborted || result.truncated)
        throw new Error('skill probe failed');
      const states = new Map<string, SkillState>();
      for (const line of String(result.stdout || '').split('\n')) {
        const [state, name] = line.split('\t');
        if ((state === 'present' || state === 'incomplete') && candidates.includes(name))
          states.set(name, state);
      }
      return states;
    } catch {
      Logger.warn('探测工作区技能失败，本轮不恢复或复制技能', LOG_CONTEXT);
      return undefined;
    }
  }

  /**
   * 站点技能：SANDBOX_SITE_SKILLS_DIR 下每个含 SKILL.md 的目录，首次进入沙箱时复制到 skills/<name>/。
   * 已存在的技能不覆盖（用户可能改过），每个 owner 每个进程只检查一次。
   */
  /** 返回 false 表示本轮没能完成（站点目录不可读或探测失败），不记为已准备 */
  private async seedSiteSkills(ownerId: string): Promise<boolean> {
    const root = String(process.env[SITE_SKILLS_ENV] || '').trim();
    if (!root) return true;
    let names: string[] = [];
    try {
      const entries = await fsp.readdir(root, { withFileTypes: true });
      names = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith('.') && !/[\n\0/]/u.test(name));
    } catch {
      return false;
    }
    const states = await this.probeSkills(ownerId, names);
    if (!states) return false;
    let seeded = false;
    let complete = true;
    for (const name of names) {
      const source = path.join(root, name);
      try {
        await fsp.access(path.join(source, 'SKILL.md'));
      } catch {
        continue;
      }
      if (states.get(name) === 'present') continue; // 已存在（用户可能改过），不覆盖
      try {
        const files: Array<{ path: string; buffer: Buffer }> = [];
        for (const file of await collectSiteSkillFiles(source, SITE_SKILL_MAX_FILES)) {
          const stat = await fsp.stat(file);
          if (stat.size > SITE_SKILL_MAX_FILE_BYTES) continue;
          files.push({
            path: path.relative(source, file).split(path.sep).join('/'),
            buffer: await fsp.readFile(file),
          });
        }
        if (await this.installSkill(ownerId, name, states.get(name), files)) seeded = true;
      } catch {
        complete = false;
        Logger.warn('站点技能复制到沙箱失败，下一轮重试', LOG_CONTEXT);
      }
    }
    if (seeded) this.indexCache.delete(ownerId);
    return complete;
  }

  async index(ownerId: string): Promise<string | undefined> {
    const cached = this.indexCache.get(ownerId);
    if (cached && Date.now() - cached.at < SKILL_INDEX_TTL_MS) return cached.text || undefined;
    let text = '';
    try {
      const entries = await this.sandbox.listDir(ownerId, SANDBOX_SKILLS_DIR, { maxEntries: 100 });
      const dirs = entries.filter(
        entry => entry.type === 'dir' && !path.posix.basename(entry.path).startsWith('.'),
      );
      // 没装完的技能（带安装标记，SKILL.md 可能只写了一半）不进索引；探测失败本轮不列任何技能、不缓存
      const states = await this.probeSkills(
        ownerId,
        dirs.map(dir => path.posix.basename(dir.path)),
      );
      if (!states) return undefined;
      const lines: string[] = [];
      for (const dir of dirs) {
        if (states.get(path.posix.basename(dir.path)) === 'incomplete') continue;
        const skillFile = `${dir.path}/SKILL.md`;
        try {
          const buffer = await this.sandbox.readFile(ownerId, skillFile, {
            maxBytes: SKILL_FILE_MAX_BYTES,
          });
          const description = summarizeSkill(buffer.toString('utf8'));
          lines.push(`  - ${path.posix.basename(dir.path)}: ${description} (${skillFile})`);
        } catch {
          // 没有 SKILL.md 的目录不算技能
        }
      }
      text = lines.join('\n');
    } catch {
      text = '';
    }
    this.indexCache.set(ownerId, { at: Date.now(), text });
    return text || undefined;
  }
}

const SITE_SKILL_MAX_FILES = 200;
const SITE_SKILL_MAX_FILE_BYTES = 2 * 1024 * 1024;

async function collectSiteSkillFiles(directory: string, limit: number): Promise<string[]> {
  const files: string[] = [];
  const stack = [directory];
  while (stack.length && files.length < limit) {
    const current = stack.pop() as string;
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        files.push(full);
        if (files.length >= limit) break;
      }
    }
  }
  return files;
}

/** 取 SKILL.md 的 frontmatter description，否则第一段非标题正文 */
export function summarizeSkill(markdown: string): string {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---/u);
  if (frontmatter) {
    const description = frontmatter[1].match(/^description:\s*(.+)$/mu);
    if (description) {
      const text = description[1].trim().replace(/^["']|["']$/gu, '');
      return text.length > SKILL_DESCRIPTION_MAX_CHARS
        ? `${text.slice(0, SKILL_DESCRIPTION_MAX_CHARS)}…`
        : text;
    }
  }
  const body = frontmatter ? markdown.slice(frontmatter[0].length) : markdown;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed.slice(0, 120);
  }
  return 'No description';
}
