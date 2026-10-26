import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { formatUrl } from '@/common/utils';
import { GLOBAL_CONFIG_SERVICE, GlobalConfigReader } from '../globalConfig/globalConfig.tokens';
import {
  LocalPrivateStorageProvider,
  LocalPublicStorageProvider,
} from './storage/local-storage.provider';
import {
  DeleteObjectInput,
  FileAssetStorageProviderName,
  GetObjectInput,
  PutObjectInput,
  SignedReadUrlInput,
  StorageProvider,
} from './storage/storage-provider.interface';
import { StorageProviderRegistry } from './storage/storage-provider.registry';

export type FileAssetStorageScope = 'public' | 'private';

const LOCAL_STORAGE_PROVIDER = 'local';

@Injectable()
export class FileAssetStorageService {
  constructor(
    @Inject(ModuleRef)
    private readonly moduleRefOrGlobalConfigService: ModuleRef | GlobalConfigReader,
    private readonly providerRegistry?: StorageProviderRegistry,
  ) {}

  async putObject(scope: FileAssetStorageScope, input: PutObjectInput, providerName?: string) {
    const provider = await this.createProvider(scope, providerName);
    return provider.putObject(input);
  }

  async getObjectStream(
    scope: FileAssetStorageScope,
    input: GetObjectInput,
    providerName?: string,
  ) {
    const provider = await this.createProvider(scope, providerName);
    return provider.getObjectStream(input);
  }

  async getObjectStat(scope: FileAssetStorageScope, input: GetObjectInput, providerName?: string) {
    const provider = await this.createProvider(scope, providerName);
    return provider.getObjectStat(input);
  }

  async deleteObject(
    scope: FileAssetStorageScope,
    input: DeleteObjectInput,
    providerName?: string,
  ) {
    const provider = await this.createProvider(scope, providerName);
    return provider.deleteObject(input);
  }

  async createSignedReadUrl(
    scope: FileAssetStorageScope,
    input: SignedReadUrlInput,
    providerName?: string,
  ) {
    const provider = await this.createProvider(scope, providerName);
    return provider.createSignedReadUrl(input);
  }

  async createProvider(
    scope: FileAssetStorageScope,
    providerName?: string,
  ): Promise<StorageProvider> {
    const provider = await this.resolveProviderName(scope, providerName);
    if (provider === LOCAL_STORAGE_PROVIDER) {
      return this.createLocalProvider(scope);
    }
    const factory = this.providerRegistry?.get(provider);
    if (!factory) {
      throw new BadRequestException('不支持的文件存储服务。');
    }
    return factory.create(scope, this.globalConfigService);
  }

  async resolveProviderName(
    scope: FileAssetStorageScope,
    providerName?: string,
  ): Promise<FileAssetStorageProviderName> {
    const configKey = scope === 'public' ? 'publicStorageProvider' : 'privateStorageProvider';
    const configured = providerName || (await this.globalConfigService.getConfigs([configKey]));
    const normalized = String(configured || LOCAL_STORAGE_PROVIDER).trim();
    if (normalized !== LOCAL_STORAGE_PROVIDER && !this.providerRegistry?.has(normalized)) {
      throw new BadRequestException('不支持的文件存储服务。');
    }
    return normalized;
  }

  private async createLocalProvider(scope: FileAssetStorageScope): Promise<StorageProvider> {
    if (scope === 'public') {
      const { publicLocalBasePath, siteUrl } = await this.globalConfigService.getConfigs([
        'publicLocalBasePath',
        'siteUrl',
      ]);
      const publicUrlPrefix = siteUrl ? `${formatUrl(siteUrl)}/file` : '/file';
      return new LocalPublicStorageProvider({
        rootDir: publicLocalBasePath || undefined,
        publicUrlPrefix,
      });
    }

    const privateLocalBasePath = await this.globalConfigService.getConfigs([
      'privateLocalBasePath',
    ]);
    return new LocalPrivateStorageProvider({ rootDir: privateLocalBasePath || undefined });
  }

  private get globalConfigService(): GlobalConfigReader {
    const injected = this.moduleRefOrGlobalConfigService as any;
    if (typeof injected?.getConfigs === 'function') {
      return injected as GlobalConfigReader;
    }

    const service = injected?.get?.(GLOBAL_CONFIG_SERVICE, { strict: false });
    if (!service || typeof service.getConfigs !== 'function') {
      throw new BadRequestException('全局配置服务尚未初始化。');
    }
    return service as GlobalConfigReader;
  }
}
