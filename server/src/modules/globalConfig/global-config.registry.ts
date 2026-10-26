import { Injectable, Logger } from '@nestjs/common';

export interface GlobalConfigItem {
  configKey: string;
  configVal: any;
}

/**
 * 配置段：扩展包向内核登记自己的配置知识，内核只保留通用的读 / 写 / 缓存 / 前台投影。
 *
 * - frontKeys：允许经 GET /config/queryFront 暴露给用户端的键（包未装载时自然不暴露）；
 * - validate：保存前校验 / 规范化，可改写 item.configVal，抛 HttpException 即拒绝整次保存；
 * - onChanged：保存成功后异步收到本次变更的键名，用于刷新令牌、重载词库等；
 * - defaults：包需要的配置默认值，内核启动时对缺失的键补齐（包删掉后不再补）；
 * - secretKeys：属于密钥 / 口令的配置键，管理端查询接口只回显脱敏值，保存时收到脱敏值视为「未修改」；
 * - dedicatedKeys：只能经专门入口（带修订号比较的原子写入）修改的键，通用配置接口拒绝写入。
 */
export interface GlobalConfigDefault {
  key: string;
  value: string;
  /** 是否经 GET /config/queryFront 暴露给用户端 */
  public?: boolean;
}

export interface GlobalConfigSection {
  name: string;
  frontKeys?: readonly string[];
  /** 密钥类配置键：查询接口脱敏回显，保存时脱敏值视为未修改 */
  secretKeys?: readonly string[];
  /** 专门入口才能写的键（如整表保存的 MCP 服务器）：通用 setConfig 拒绝 */
  dedicatedKeys?: readonly string[];
  defaults?: readonly GlobalConfigDefault[];
  validate?: (item: GlobalConfigItem) => void | Promise<void>;
  onChanged?: (changedKeys: readonly string[]) => void | Promise<void>;
}

@Injectable()
export class GlobalConfigRegistry {
  private readonly sections = new Map<string, GlobalConfigSection>();

  register(section: GlobalConfigSection): void {
    if (!section?.name) {
      throw new Error('配置段必须提供 name');
    }
    if (this.sections.has(section.name)) {
      throw new Error(`配置段 ${section.name} 已注册`);
    }
    this.sections.set(section.name, section);
  }

  listSections(): string[] {
    return [...this.sections.keys()];
  }

  /** 各配置段登记的前台可见键（去重） */
  frontKeys(): string[] {
    const keys = new Set<string>();
    for (const section of this.sections.values()) {
      for (const key of section.frontKeys ?? []) keys.add(key);
    }
    return [...keys];
  }

  /** 各配置段登记的密钥类键（去重） */
  secretKeys(): Set<string> {
    const keys = new Set<string>();
    for (const section of this.sections.values()) {
      for (const key of section.secretKeys ?? []) keys.add(key);
    }
    return keys;
  }

  /** 各配置段登记的专用键（去重） */
  dedicatedKeys(): Set<string> {
    const keys = new Set<string>();
    for (const section of this.sections.values()) {
      for (const key of section.dedicatedKeys ?? []) keys.add(key);
    }
    return keys;
  }

  /**
   * 不区分大小写地找已登记的键名（前台键、密钥、专用键、默认值）：MySQL 默认的 _ci 排序规则下
   * 大小写变体读写的是同一行，写入前据此拒绝变体。没有登记过返回 undefined
   */
  registeredKeyFor(key: string): string | undefined {
    const lower = key.toLowerCase();
    const keys = [
      ...this.frontKeys(),
      ...this.secretKeys(),
      ...this.dedicatedKeys(),
      ...this.defaults().map(item => item.key),
    ];
    return keys.find(item => item.toLowerCase() === lower);
  }

  /** 各配置段声明的默认值（按登记顺序，后登记的同名键不覆盖先登记的） */
  defaults(): GlobalConfigDefault[] {
    const seen = new Set<string>();
    const out: GlobalConfigDefault[] = [];
    for (const section of this.sections.values()) {
      for (const item of section.defaults ?? []) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        out.push(item);
      }
    }
    return out;
  }

  /** 逐段校验一个待保存的配置项；任一段抛错即中止 */
  async validate(item: GlobalConfigItem): Promise<void> {
    for (const section of this.sections.values()) {
      await section.validate?.(item);
    }
  }

  /** 通知各段配置已变更；单段失败只记日志，不影响其他段 */
  async notifyChanged(changedKeys: readonly string[]): Promise<void> {
    for (const section of this.sections.values()) {
      if (!section.onChanged) continue;
      try {
        await section.onChanged(changedKeys);
      } catch (error) {
        Logger.error(
          `配置段 ${section.name} 处理配置变更失败: ${error?.message || error}`,
          'GlobalConfigRegistry',
        );
      }
    }
  }
}
