import { Injectable } from '@nestjs/common';
import type { StorageProviderFactory } from './storage-provider.interface';

/** 对象存储厂商注册表（内核）。本地目录始终可用，其余厂商由各存储包在构造时 register。 */
@Injectable()
export class StorageProviderRegistry {
  private readonly factories = new Map<string, StorageProviderFactory>();

  register(factory: StorageProviderFactory): void {
    const name = String(factory?.name || '').trim();
    if (!name) {
      throw new Error('StorageProviderFactory 缺少 name');
    }
    this.factories.set(name, factory);
  }

  get(name: string): StorageProviderFactory | undefined {
    return this.factories.get(String(name || '').trim());
  }

  has(name: string): boolean {
    return this.factories.has(String(name || '').trim());
  }

  names(): string[] {
    return Array.from(this.factories.keys());
  }
}
