import { Injectable } from '@nestjs/common';
import type { ModelProtocolDescriptor, ModelStreamAdapter } from './model-stream.types';

/**
 * 协议适配器注册表（内核）。内核自带 OpenAI Chat Completions 基线协议，
 * 其余协议由各模型包的适配器在构造时 register；URL 构造、管理端协议列表都只看这张表。
 */
@Injectable()
export class ModelStreamRegistry {
  private readonly adapters = new Map<string, ModelStreamAdapter>();

  /** 测试 / 脚本用：一次性登记多个适配器（Nest 注入时构造函数不接参数） */
  static from(adapters: ModelStreamAdapter[]): ModelStreamRegistry {
    const registry = new ModelStreamRegistry();
    adapters.forEach(adapter => registry.register(adapter));
    return registry;
  }

  register(adapter: ModelStreamAdapter): void {
    const protocol = this.normalizeProtocol(adapter.protocol);
    if (!protocol) {
      throw new Error('ModelStreamAdapter 缺少 protocol');
    }
    this.adapters.set(protocol, adapter);
  }

  get(protocol: string): ModelStreamAdapter {
    const normalized = this.normalizeProtocol(protocol);
    const adapter = normalized ? this.adapters.get(normalized) : undefined;
    if (!adapter) {
      throw new Error(`当前暂不支持协议真实调用: ${protocol || '未配置'}`);
    }
    return adapter;
  }

  has(protocol: string): boolean {
    const normalized = this.normalizeProtocol(protocol);
    return Boolean(normalized && this.adapters.has(normalized));
  }

  describe(protocol: string): ModelProtocolDescriptor | undefined {
    const normalized = this.normalizeProtocol(protocol);
    return normalized ? this.adapters.get(normalized)?.descriptor : undefined;
  }

  list(): ModelStreamAdapter[] {
    return Array.from(this.adapters.values());
  }

  listDescriptors(): ModelProtocolDescriptor[] {
    return this.list().map(adapter => adapter.descriptor);
  }

  getProtocols(): string[] {
    return Array.from(this.adapters.keys());
  }

  private normalizeProtocol(protocol: string | undefined): string {
    return typeof protocol === 'string' ? protocol.trim() : '';
  }
}
