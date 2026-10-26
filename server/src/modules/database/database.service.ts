import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuthConfig } from '@/common/config/auth.config';
import { createStorageId } from '@/common/utils';
import { getErrorStack } from '@/common/utils/error-stack.util';
import * as bcrypt from 'bcryptjs';
import { maxLength, minLength } from 'class-validator';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';

const INITIAL_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const INITIAL_PASSWORD_LENGTH = 16;
const INITIAL_PASSWORD_PATTERN = new RegExp(
  `^[${INITIAL_PASSWORD_ALPHABET}]{${INITIAL_PASSWORD_LENGTH}}$`,
);
/** 与登录接口的密码长度同一套计数（class-validator，代理对与变体选择符不单独计数）：上限同为 30，下限 8 比登录的 6 更严 */
const MIN_CONFIGURED_PASSWORD_LENGTH = 8;
const MAX_CONFIGURED_PASSWORD_LENGTH = 30;
/** 初始化超级管理员的数据库命名锁：多个实例同时首次启动时只有一个在建账号 */
const INIT_ADMIN_LOCK = '99agent:init-admin';
const INIT_ADMIN_LOCK_TIMEOUT_SECONDS = 30;
/** 密码文件恰好两行：第一行密码，第二行是这个标记加一段 JSON（版本、数据库实例、库名、账号的 storageId） */
const PASSWORD_FILE_MARK = '# 99agent-init-admin ';
const PASSWORD_FILE_KEYS = 'database,server,storageId,v';
const SERVER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STORAGE_ID_PATTERN = /^stor_[0-9A-Za-z]{18}$/;
/** 读写密码文件都不跟随符号链接；读时不因命名管道阻塞（平台没有这些标志时为 0） */
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK ?? 0;

export interface InitialAdminPassword {
  password: string;
  source: 'env' | 'generated';
}

/** 密码文件属于哪个数据库：@@server_uuid（小写）与 DATABASE() */
export interface InitialPasswordOwner {
  server: string;
  database: string;
}

export interface InitialPasswordFileContent extends InitialPasswordOwner {
  password: string;
  storageId: string;
}

/**
 * 首次初始化超级管理员时的密码来源：
 * - ADMIN_INITIAL_PASSWORD（8 – 30 个字符：计数方式与上限同登录密码，下限更严）；
 * - 未配置时随机生成 16 位，写入 ADMIN_INITIAL_PASSWORD_FILE（默认 storage/initial-admin-password.txt，仅本机可读）。
 * 不再使用固定默认口令，也不把口令写进日志。
 */
export function resolveInitialAdminPassword(
  env: NodeJS.ProcessEnv = process.env,
): InitialAdminPassword {
  const configured = String(env.ADMIN_INITIAL_PASSWORD || '').trim();
  if (configured) {
    if (
      !minLength(configured, MIN_CONFIGURED_PASSWORD_LENGTH) ||
      !maxLength(configured, MAX_CONFIGURED_PASSWORD_LENGTH)
    ) {
      throw new Error(
        `ADMIN_INITIAL_PASSWORD 须为 ${MIN_CONFIGURED_PASSWORD_LENGTH} – ${MAX_CONFIGURED_PASSWORD_LENGTH} 个字符（与登录密码同样计数，上限一致、下限更严）`,
      );
    }
    return { password: configured, source: 'env' };
  }
  const bytes = randomBytes(INITIAL_PASSWORD_LENGTH);
  const password = Array.from(
    bytes,
    byte => INITIAL_PASSWORD_ALPHABET[byte % INITIAL_PASSWORD_ALPHABET.length],
  ).join('');
  return { password, source: 'generated' };
}

export function resolveInitialPasswordFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.ADMIN_INITIAL_PASSWORD_FILE || '').trim();
  return path.resolve(
    process.cwd(),
    configured || path.join('storage', 'initial-admin-password.txt'),
  );
}

export function formatInitialPasswordFile(content: InitialPasswordFileContent): string {
  const owner = JSON.stringify({
    v: 1,
    server: content.server,
    database: content.database,
    storageId: content.storageId,
  });
  return `${content.password}\n${PASSWORD_FILE_MARK}${owner}\n`;
}

/** 按格式合同解析密码文件；任何一项不符返回 null */
export function parseInitialPasswordFile(text: string): InitialPasswordFileContent | null {
  const lines = text.split('\n');
  if (lines.length !== 3 || lines[2] !== '') return null;
  const [password, ownerLine] = lines;
  if (!INITIAL_PASSWORD_PATTERN.test(password) || !ownerLine.startsWith(PASSWORD_FILE_MARK)) {
    return null;
  }
  let owner: unknown;
  try {
    owner = JSON.parse(ownerLine.slice(PASSWORD_FILE_MARK.length));
  } catch {
    return null;
  }
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) return null;
  if (Object.keys(owner).sort().join(',') !== PASSWORD_FILE_KEYS) return null;
  const { v, server, database, storageId } = owner as Record<string, unknown>;
  if (
    v !== 1 ||
    typeof server !== 'string' ||
    !SERVER_UUID_PATTERN.test(server) ||
    typeof database !== 'string' ||
    !database ||
    typeof storageId !== 'string' ||
    !STORAGE_ID_PATTERN.test(storageId)
  ) {
    return null;
  }
  return { password, server, database, storageId };
}

/**
 * 读取并核验已存在的密码文件：不存在返回 undefined；存在但不是当前用户的 0600 普通文件、格式不对
 * 或属于另一个数据库时抛错（不创建账号，交给人工处理）
 */
function readOwnedInitialPasswordFile(
  file: string,
  owner: InitialPasswordOwner,
): InitialPasswordFileContent | undefined {
  const refuse = (reason: string) =>
    new Error(
      `初始管理员密码文件 ${file} ${reason}：没有创建账号；请人工核对后删除该文件，或改用 ADMIN_INITIAL_PASSWORD 后重新启动`,
    );
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  } catch (error) {
    // 上级路径不是目录时同样不可能存在这个文件，交给发布那一步报错
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return undefined;
    throw refuse(error?.code === 'ELOOP' ? '是符号链接' : '无法读取');
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw refuse('不是普通文件');
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      throw refuse('不属于当前用户');
    }
    if ((stat.mode & 0o777) !== 0o600) throw refuse('的权限不是 0600');
    const parsed = parseInitialPasswordFile(fs.readFileSync(fd, 'utf8'));
    if (!parsed) throw refuse('不是本程序生成的格式');
    if (parsed.server !== owner.server || parsed.database !== owner.database) {
      throw refuse('属于另一个数据库');
    }
    // 上一次可能在落盘前中断：沿用之前先把文件内容与目录项都同步到磁盘，再去建账号
    fs.fsyncSync(fd);
    syncDirectory(path.dirname(file));
    return parsed;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 不覆盖地发布密码文件：同目录写临时文件（O_EXCL、0600）并 fsync，再用 link 发布到目标路径
 * （目标已存在时 link 报 EEXIST、不会覆盖，返回 false），最后删除临时文件并 fsync 目录
 */
function publishInitialPasswordFile(file: string, text: string): boolean {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  const fd = fs.openSync(
    temp,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      fs.fchmodSync(fd, 0o600);
      fs.writeFileSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(temp, file);
    } catch (error) {
      if (error?.code === 'EEXIST') return false;
      throw error;
    }
  } finally {
    fs.rmSync(temp, { force: true });
  }
  syncDirectory(dir);
  return true;
}

function syncDirectory(dir: string) {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } catch (error) {
    // 个别平台不支持对目录 fsync（如 Windows）：文件本身已经 fsync 过
    if (!['EINVAL', 'EISDIR', 'EPERM', 'EBADF'].includes(error?.code)) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}
  async onModuleInit() {
    await this.checkSuperAdmin();
    await this.checkSiteBaseConfig();
  }

  /**
   * 首次启动时创建超级管理员 super；已存在时什么都不改。
   * 建账号整段在数据库命名锁里、用同一条连接完成（多实例同时首次启动也只会建一个）；随机密码时先把密码文件写好、
   * 落盘，再插入账号。插入失败或结果不确定时中止启动、文件保留，下次启动核验归属后复用同一个密码；
   * 任何情况下都不删除、不覆盖密码文件
   */
  async checkSuperAdmin(env: NodeJS.ProcessEnv = process.env) {
    if (await this.superAdminExists(this.dataSource)) return;
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      const [row] = await runner.query('SELECT GET_LOCK(?, ?) AS locked', [
        INIT_ADMIN_LOCK,
        INIT_ADMIN_LOCK_TIMEOUT_SECONDS,
      ]);
      // 1 才是拿到了；0 是超时、NULL 是出错
      locked = Number(row?.locked) === 1;
      if (!locked) {
        throw new Error(
          '没有拿到初始化超级管理员的数据库锁（可能另一个实例正在初始化）：没有创建账号，请稍后重新启动',
        );
      }
      await this.createSuperAdminLocked(runner, env);
    } finally {
      if (locked) await this.releaseInitLock(runner);
      await runner.release();
    }
  }

  private async createSuperAdminLocked(runner: QueryRunner, env: NodeJS.ProcessEnv) {
    if (await this.superAdminExists(runner)) return;
    const initial = resolveInitialAdminPassword(env);
    if (initial.source === 'env') {
      await this.insertSuperAdmin(runner, initial.password, createStorageId());
      Logger.log(
        '超级管理员 super 的初始密码来自 ADMIN_INITIAL_PASSWORD，登录后请尽快修改。',
        'DatabaseService',
      );
      return;
    }
    const owner = await this.currentDatabase(runner);
    const prepared = this.prepareInitialPasswordFile(
      resolveInitialPasswordFilePath(env),
      owner,
      initial.password,
    );
    await this.insertSuperAdmin(runner, prepared.password, prepared.storageId);
    Logger.warn(
      '超级管理员 super 的初始密码在初始密码文件里（默认 storage/initial-admin-password.txt，ADMIN_INITIAL_PASSWORD_FILE 可改路径，仅本机可读）。请登录后立即修改密码并删除该文件。',
      'DatabaseService',
    );
  }

  /** 已有核验通过的密码文件就复用（上次初始化中途失败留下的）；没有则生成并不覆盖地发布 */
  private prepareInitialPasswordFile(
    file: string,
    owner: InitialPasswordOwner,
    candidate: string,
  ): InitialPasswordFileContent {
    const existing = readOwnedInitialPasswordFile(file, owner);
    if (existing) {
      Logger.warn('沿用上次初始化留下的初始密码文件', 'DatabaseService');
      return existing;
    }
    const content = { ...owner, password: candidate, storageId: createStorageId() };
    let published: boolean;
    try {
      published = publishInitialPasswordFile(file, formatInitialPasswordFile(content));
    } catch (error) {
      // 文件系统错误的消息里带路径：日志只记错误码，路径只出现在抛给启动流程的提示里
      Logger.error(
        '写入初始管理员密码文件失败',
        `code=${String(error?.code ?? 'unknown')}`,
        'DatabaseService',
      );
      throw new Error(
        `无法写入初始管理员密码文件 ${file}：没有创建账号；请检查目录权限，或用 ADMIN_INITIAL_PASSWORD 指定初始密码后重新启动`,
      );
    }
    if (published) return content;
    // 核验之后目标被别处写了出来：同样核验归属，合格才复用
    const raced = readOwnedInitialPasswordFile(file, owner);
    if (raced) return raced;
    throw new Error(`初始管理员密码文件 ${file} 正在被别处改动：没有创建账号，请重新启动`);
  }

  private async currentDatabase(runner: QueryRunner): Promise<InitialPasswordOwner> {
    const [row] = await runner.query('SELECT @@server_uuid AS server, DATABASE() AS name');
    const server = String(row?.server ?? '').toLowerCase();
    const database = row?.name == null ? '' : String(row.name);
    if (!SERVER_UUID_PATTERN.test(server) || !database) {
      throw new Error(
        '无法确认当前数据库（@@server_uuid、DATABASE()），不能生成初始密码文件：没有创建账号；请改用 ADMIN_INITIAL_PASSWORD 后重新启动',
      );
    }
    return { server, database };
  }

  /** 插入报错不等于没写进去（例如提交之后连接断开）：按本次的 storageId 核对 */
  private async insertSuperAdmin(runner: QueryRunner, password: string, storageId: string) {
    const hash = bcrypt.hashSync(password, AuthConfig.bcrypt.rounds);
    try {
      await runner.query(
        'INSERT INTO users (username, password, status, email, role, storageId) VALUES (?, ?, ?, ?, ?, ?)',
        ['super', hash, 1, null, 'super', storageId],
      );
      Logger.log('初始化创建超级管理员 super 成功', 'DatabaseService');
      return;
    } catch (error) {
      Logger.error(
        '创建超级管理员时插入报错，按本次的 storageId 核对',
        getErrorStack(error),
        'DatabaseService',
      );
    }
    let created: boolean;
    try {
      const rows = await runner.query('SELECT id FROM users WHERE storageId = ? LIMIT 1', [
        storageId,
      ]);
      created = Array.isArray(rows) && rows.length > 0;
    } catch (error) {
      Logger.error('核对超级管理员是否已创建失败', getErrorStack(error), 'DatabaseService');
      throw new Error('创建超级管理员的结果不确定：请检查数据库后重新启动');
    }
    if (!created) throw new Error('创建超级管理员失败：请检查数据库后重新启动');
    Logger.warn('创建超级管理员时插入报错，但核对确认账号已创建', 'DatabaseService');
  }

  private async superAdminExists(source: { query(sql: string): Promise<unknown> }) {
    const rows = await source.query(`SELECT id FROM users WHERE role = 'super' LIMIT 1`);
    return Array.isArray(rows) && rows.length > 0;
  }

  private async releaseInitLock(runner: QueryRunner) {
    try {
      await runner.query('SELECT RELEASE_LOCK(?)', [INIT_ADMIN_LOCK]);
    } catch (error) {
      // 连接断开时 MySQL 会自动释放命名锁
      Logger.error('释放初始化超级管理员的数据库锁失败', getErrorStack(error), 'DatabaseService');
    }
  }

  /* 检测有没有网站基础配置 */
  async checkSiteBaseConfig() {
    const keys = ['siteName'];
    const placeholders = keys.map(() => '?').join(', ');
    const result = await this.dataSource.query(
      `SELECT COUNT(*) AS count FROM config WHERE \`configKey\` IN (${placeholders})`,
      keys,
    );
    const count = parseInt(result[0].count);
    if (count === 0) {
      await this.createBaseSiteConfig();
    }
  }

  /* 创建基础的网站数据 */
  async createBaseSiteConfig() {
    try {
      // 初始公告提供首次登录引导。
      const noticeInfo = `
#### 欢迎使用 99Agent
 - 初始超级管理员账号为 super，初始密码见部署说明（ADMIN_INITIAL_PASSWORD 或 storage/initial-admin-password.txt）
 - 首次部署后请立即修改超级管理员密码，并在管理后台替换本公告
`;

      // 只种内核自己的键；扩展包的默认值由各自的配置段声明，GlobalConfigService 启动时补齐
      const defaultConfig = [
        { configKey: 'siteName', configVal: '', public: 1, encrypt: 0 },
        { configKey: 'noticeInfo', configVal: noticeInfo, public: 1, encrypt: 0 },
      ];

      const valuePlaceholders = defaultConfig.map(() => '(?, ?, ?, ?)').join(', ');
      const values = defaultConfig.flatMap(d => [d.configKey, d.configVal, d.public, d.encrypt]);
      await this.dataSource.query(
        `INSERT INTO config (configKey, configVal, public, encrypt) VALUES ${valuePlaceholders}`,
        values,
      );
      Logger.log(
        `初始化网站配置信息成功、如您需要修改网站配置信息，请前往管理系统系统配置设置 ==============> 请注意查阅`,
        'DatabaseService',
      );
    } catch (error) {
      Logger.error(
        `创建默认网站配置失败: ${error.message}`,
        getErrorStack(error),
        'DatabaseService',
      );
      throw new HttpException('创建默认网站配置失败！', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
