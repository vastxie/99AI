import { getErrorStack } from '@/common/utils/error-stack.util';
import { isMaskedSecret, maskSecret } from '@/common/utils/secret-mask.util';
import { createHash } from 'crypto';

import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import * as fs from 'fs';
import { EntityManager, In, Repository } from 'typeorm';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { ConfigEntity } from './config.entity';
import { QueryConfigDto } from './dto/queryConfig.dto';
import {
  CONFIG_VALUE_MAX_BYTES,
  isStorableConfigValue,
  normalizeConfigValue,
  SetConfigDto,
} from './dto/setConfig.dto';
import { GlobalConfigItem, GlobalConfigRegistry } from './global-config.registry';

const packageJsonContent = fs.readFileSync('package.json', 'utf-8');
const packageJson = JSON.parse(packageJsonContent);
const version = packageJson.version;

Logger.log(`当前版本: ${version}`, 'GlobalConfigService');

/**
 * 内核自己允许经 GET /config/queryFront 暴露给用户端的键；
 * 扩展包的前台键由各包向 GlobalConfigRegistry 登记（包未装载时不暴露）。
 */
export const KERNEL_FRONT_CONFIG_KEYS: readonly string[] = [
  'agreementInfo',
  'agreementTitle',
  'clientFaviconPath',
  'clientLogoPath',
  'companyName',
  'defaultLanguage',
  'enabledLanguages',
  'filingNumber',
  'isAutoOpenAgreement',
  'isAutoOpenNotice',
  'maxInputLength',
  'noticeInfo',
  'noticeTitle',
  'publicSecurityFilingNumber',
  'showWatermark',
  'siteDescription',
  'siteKeywords',
  'siteName',
  'siteTitle',
  'uploadFileLimit',
  'uploadFileSizeLimit',
];

/**
 * 站点配置：读 / 写 / 内存缓存 / 前台投影。
 * 业务配置的解释权在各扩展包；内核只提供通用读写、默认值补齐与配置段注册表。
 */
@Injectable()
export class GlobalConfigService implements OnModuleInit {
  // Redis 缓存键前缀
  private readonly CACHE_PREFIX = 'globalConfig:';

  constructor(
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    private readonly redisCacheService: RedisCacheService,
    private readonly configRegistry: GlobalConfigRegistry,
  ) {}

  private globalConfigs: any = {};
  /** 进行中的写入数：读取等到全部写入结束（含写后的缓存重载）再读，不会读到写到一半的缓存 */
  private updatingWrites = 0;
  /** 缓存重载序号：并发写入各自重载时，旧的重载晚到不覆盖新的 */
  private reloadSeq = 0;
  private appliedReloadSeq = 0;

  async onModuleInit() {
    await this.initGetAllConfig();
    await this.ensureSectionDefaults();
  }

  /** 补齐各配置段声明的默认值；只写缺失的键，不覆盖已有配置 */
  async ensureSectionDefaults() {
    const missing = this.configRegistry
      .defaults()
      .filter(item => this.globalConfigs[item.key] === undefined);
    if (!missing.length) return;
    await this.configEntity.save(
      missing.map(item => ({
        configKey: item.key,
        configVal: item.value,
        public: item.public ? 1 : 0,
        encrypt: 0,
      })),
    );
    await this.initGetAllConfig();
  }

  /* 对外提供给其他service  */
  async getConfigs(configKey: string[]) {
    while (this.updatingWrites > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (configKey.length === 0) return;

    if (configKey.length === 1) {
      const value = this.globalConfigs[configKey[0]];
      return value;
    } else {
      const result: Record<string, unknown> = {};
      configKey.forEach(key => {
        result[key] = this.globalConfigs[key];
      });
      return result;
    }
  }

  /* 读取单个配置：数据库配置 > 环境变量 > 默认值（供扩展包解析带兜底的地址类配置） */
  async getConfigWithFallback(configKey: string, envKey?: string, fallback = ''): Promise<string> {
    const configured = await this.getConfigs([configKey]);
    if (configured) return String(configured);
    const envValue = envKey ? process.env[envKey] : '';
    if (envValue) return envValue;
    return fallback;
  }

  /* 初始化查询所有config 不对外调用 */
  async initGetAllConfig() {
    const seq = ++this.reloadSeq;
    // 按 id 升序：同一个键有多行时 id 最大的一行生效（与 readStoredValue 一致）
    const data = await this.configEntity.find({ order: { id: 'ASC' } });
    if (seq <= this.appliedReloadSeq) return;
    this.appliedReloadSeq = seq;
    this.globalConfigs = data.reduce<Record<string, string>>((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
  }

  /** 只能经专门入口写的键（各配置段登记）：通用写入与垂直导入的站点配置不接受 */
  dedicatedConfigKeys(): Set<string> {
    return this.configRegistry.dedicatedKeys();
  }

  /** 配置值的修订号：没有这一行为 none，否则为值的 sha256 前 16 位 */
  static revisionOf(value: string | null | undefined): string {
    if (value === null || value === undefined) return 'none';
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  /** 从数据库读一个键的当前值（不读进程缓存）；多行时 id 最大的一行生效，没有行为 null */
  async readStoredValue(configKey: string, manager?: EntityManager): Promise<string | null> {
    const repository = manager ? manager.getRepository(ConfigEntity) : this.configEntity;
    const row = await repository.findOne({ where: { configKey }, order: { id: 'DESC' } });
    return row ? (row.configVal ?? '') : null;
  }

  /**
   * 带修订号比较的原子写入（专用键用）：专用连接取 MySQL 命名锁，锁内从数据库读当前值、核对修订号，
   * 由 build(当前值) 生成新值，校验后写入；提交后重载缓存并通知变更，返回新修订号。
   * build 只用传入的数据库值，不要在里面调用 getConfigs（写入期间读取会等写入结束）。
   */
  async compareAndSetConfig(
    configKey: string,
    expectedRevision: string,
    build: (current: string | null) => string | Promise<string>,
  ): Promise<{ revision: string }> {
    this.updatingWrites += 1;
    try {
      const revision = await this.writeUnderNamedLock(configKey, expectedRevision, build);
      await this.initGetAllConfig();
      await this.clearConfigCache([configKey]);
      setImmediate(() => {
        void this.configRegistry.notifyChanged([configKey]);
      });
      return { revision };
    } finally {
      this.updatingWrites -= 1;
    }
  }

  private async writeUnderNamedLock(
    configKey: string,
    expectedRevision: string,
    build: (current: string | null) => string | Promise<string>,
  ): Promise<string> {
    const runner = this.configEntity.manager.dataSource.createQueryRunner();
    const lockName = `config:${createHash('sha256').update(configKey).digest('hex').slice(0, 48)}`;
    let locked = false;
    try {
      await runner.connect();
      const rows = await runner.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
      if (Number(rows?.[0]?.acquired) !== 1) {
        throw Object.assign(
          new HttpException('配置正忙，请稍后重试', HttpStatus.SERVICE_UNAVAILABLE),
          { controlled: true },
        );
      }
      locked = true;
      await runner.startTransaction();
      try {
        const current = await this.readStoredValue(configKey, runner.manager);
        if (GlobalConfigService.revisionOf(current) !== expectedRevision) {
          throw new HttpException('配置已被其他人修改，请刷新后重试', HttpStatus.CONFLICT);
        }
        const configVal = await this.checkConfigValue(configKey, await build(current));
        if (current === null) {
          await runner.manager.save(ConfigEntity, { configKey, configVal });
        } else {
          await runner.manager.update(ConfigEntity, { configKey }, { configVal });
        }
        await runner.commitTransaction();
        return GlobalConfigService.revisionOf(configVal);
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      try {
        if (locked) await runner.query('SELECT RELEASE_LOCK(?)', [lockName]);
      } finally {
        await runner.release();
      }
    }
  }

  /**
   * 一个键的新值写入前的检查（原子写入在锁内用，垂直导入的预演也用，两种模式结果一致）：
   * 规范化后按类型、大小与各扩展包的校验器检查，不能含脱敏占位。返回规范化后的值
   */
  async checkConfigValue(configKey: string, value: unknown): Promise<string> {
    const item = { configKey, configVal: normalizeConfigValue(value) };
    this.assertStorableConfigValue(item.configVal);
    await this.configRegistry.validate(item);
    this.assertStorableConfigValue(item.configVal);
    if (isMaskedSecret(String(item.configVal))) {
      throw new HttpException('配置里不能包含脱敏占位，请重新填写密钥', HttpStatus.BAD_REQUEST);
    }
    return String(item.configVal);
  }

  /**
   * 通用写入前的检查与规范化（setConfig 与垂直导入站点配置的预演共用，只读数据库）：
   * - 键名只差大小写的拒绝：与已登记的键、数据库里已有的键、同一次提交里的其他键（MySQL 默认的 _ci
   *   排序规则下它们读写同一行，会绕过按名字生效的专用键、密钥与校验规则）；
   * - 专用键拒绝（只能经各自带修订号比较的入口写）；
   * - 密钥类键提交脱敏值表示不修改，跳过；其余规范化后按类型、大小与各扩展包的校验器检查。
   * 返回要写入的项（校验器可能改写了取值）
   */
  async prepareSettings(settings: GlobalConfigItem[]): Promise<GlobalConfigItem[]> {
    const seen = new Map<string, string>();
    for (const { configKey } of settings) {
      const lower = String(configKey).toLowerCase();
      const other = seen.get(lower);
      if (other !== undefined && other !== configKey) {
        throw new HttpException(
          `配置项 ${configKey} 与 ${other} 只差大小写，请只保留一个`,
          HttpStatus.BAD_REQUEST,
        );
      }
      seen.set(lower, configKey);
      const registered =
        this.configRegistry.registeredKeyFor(configKey) ??
        KERNEL_FRONT_CONFIG_KEYS.find(key => key.toLowerCase() === lower);
      if (registered !== undefined && registered !== configKey) {
        throw new HttpException(`配置项 ${configKey} 应写作 ${registered}`, HttpStatus.BAD_REQUEST);
      }
    }

    // 专用键（如 MCP 服务器）只能经各自带修订号比较的入口写，通用接口不接受
    const dedicated = this.configRegistry.dedicatedKeys();
    const blocked = settings.find(item => dedicated.has(item.configKey));
    if (blocked) {
      throw new HttpException(
        `${blocked.configKey} 请在对应的管理页面或垂直包导入里修改`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (settings.length) {
      const rows = await this.configEntity.find({
        where: { configKey: In(settings.map(item => item.configKey)) },
      });
      for (const row of rows) {
        const submitted = settings.find(
          item => item.configKey.toLowerCase() === row.configKey.toLowerCase(),
        );
        if (submitted && submitted.configKey !== row.configKey) {
          throw new HttpException(
            `配置项 ${submitted.configKey} 与已有的 ${row.configKey} 只差大小写，请使用原名`,
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    // 管理端回显的是脱敏值：密钥类键原样提交脱敏值表示不修改，直接跳过
    const secretKeys = this.configRegistry.secretKeys();
    const kept = settings.filter(
      item => !(secretKeys.has(item.configKey) && isMaskedSecret(item.configVal)),
    );

    /* 交给各扩展包登记的校验器：可规范化取值，抛错即拒绝整次保存。
       内部调用（垂直包导入、公众号菜单等）不经过 DTO，这里按同一规则再检查一次 */
    for (const item of kept) {
      item.configVal = normalizeConfigValue(item.configVal) as string;
      this.assertStorableConfigValue(item.configVal);
      await this.configRegistry.validate(item);
      this.assertStorableConfigValue(item.configVal);
    }
    return kept;
  }

  /** 管理端查询接口的投影：各扩展包登记的密钥类键只回显脱敏值 */
  private maskSecretValues(entries: Record<string, any>): Record<string, any> {
    const secretKeys = this.configRegistry.secretKeys();
    if (secretKeys.size === 0) return entries;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(entries)) {
      result[key] = secretKeys.has(key) ? maskSecret(value) : value;
    }
    return result;
  }

  /* 查询所有配置信息（管理端；密钥类键脱敏） */
  queryAllConfig(_req: Request): Promise<Record<string, any>> {
    return Promise.resolve(this.maskSecretValues({ ...this.globalConfigs }));
  }

  /* 前端网站的所有查阅权限的配置信息 */
  async queryFrontConfig(query: unknown, req: unknown) {
    /* 指定前端可以访问范围：内核键 + 已装载扩展包登记的键 */
    const allowKeys = [
      ...new Set([...KERNEL_FRONT_CONFIG_KEYS, ...this.configRegistry.frontKeys()]),
    ];
    const data = await this.configEntity.find({
      where: { configKey: In(allowKeys) },
    });
    return data.reduce<Record<string, string>>((prev, cur) => {
      prev[cur.configKey] = cur.configVal;
      return prev;
    }, {});
  }

  /* 查询配置（管理端；密钥类键脱敏） */
  async queryConfig(body: QueryConfigDto, _req: Request) {
    const keys = body.keys;
    if (!keys.length) return {};
    const data = await this.configEntity.find({
      where: { configKey: In(keys) },
    });
    return this.maskSecretValues(
      data.reduce<Record<string, string>>((prev, cur) => {
        prev[cur.configKey] = cur.configVal;
        return prev;
      }, {}),
    );
  }

  /* 设置配置信息 */
  async setConfig(body: SetConfigDto) {
    // 写入计数：读取等到全部写入结束
    this.updatingWrites += 1;

    try {
      const settings = await this.prepareSettings(body.settings || []);

      // 使用事务确保数据一致性
      await this.configEntity.manager.transaction(async transactionalEntityManager => {
        for (const item of settings) {
          const { configKey, configVal } = item;
          const c = await transactionalEntityManager.findOne(ConfigEntity, {
            where: { configKey },
          });
          if (c) {
            await transactionalEntityManager.update(ConfigEntity, { configKey }, { configVal });
          } else {
            await transactionalEntityManager.save(ConfigEntity, {
              configKey,
              configVal,
            });
          }
        }
      });

      // 确保在事务成功后才更新缓存
      await this.initGetAllConfig();
      // 清除 Redis 中的配置缓存
      const keys = settings.map(item => item.configKey);
      await this.clearConfigCache(keys);

      /* 异步通知各扩展包（刷新令牌、重载词库等），不阻塞响应 */
      setImmediate(() => {
        void this.configRegistry.notifyChanged(keys);
      });

      return '设置完成！';
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error('配置更新失败', getErrorStack(error), 'GlobalConfigService');
      throw new HttpException('设置配置信息错误！', HttpStatus.BAD_REQUEST);
    } finally {
      this.updatingWrites -= 1;
    }
  }

  private assertStorableConfigValue(value: unknown): void {
    if (!isStorableConfigValue(value)) {
      throw new HttpException(
        `配置值只能是字符串、数字或布尔值，且不超过 ${CONFIG_VALUE_MAX_BYTES} 字节`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /* get namespace */
  getNamespace() {
    return process.env.NAMESPACE || 'AIWeb';
  }

  /**
   * 清除 Redis 中的配置缓存
   */
  private async clearConfigCache(updatedKeys: string[]): Promise<void> {
    try {
      // 清除特定配置的缓存（如果有的话）
      for (const key of updatedKeys) {
        const cacheKey = `${this.CACHE_PREFIX}${key}`;
        await this.redisCacheService.del({ key: cacheKey });
      }
      Logger.debug(`已清除 ${updatedKeys.length} 个配置项的 Redis 缓存`, 'GlobalConfigService');
    } catch (error) {
      Logger.error(`清除配置缓存失败: ${error.message}`, 'GlobalConfigService');
      // 缓存清除失败不应该影响配置更新，所以这里只记录错误
    }
  }
}
