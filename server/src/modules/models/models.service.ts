import { requireRequestUser } from '@/common/auth/request-user';
import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { getErrorStack } from '../../common/utils/error-stack.util';
import { isMaskedSecret, maskSecret } from '../../common/utils/secret-mask.util';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { ModelGatewayService } from '../modelGateway/model-gateway.service';
import {
  DEFAULT_MODEL_PROTOCOL,
  deriveCapabilitiesFromMultimodalTypes,
  findReservedAdditionalParams,
  ModelGatewayCapabilities,
  ModelGatewayRemoteModel,
  ModelGatewayRuntimeConfig,
  multimodalTypesFromCapabilities,
  parseModelGatewayAdditionalParams,
  withNormalizedModelGatewayReasoningControl,
} from '../modelGateway/model-gateway.types';
import { QueryModelDto } from './dto/queryModel.dto';
import type { Request } from 'express';
import type { RemoteModelListItemResponse } from './dto/remoteModelList.dto';
import { SetModelDto } from './dto/setModel.dto';
import { ModelsEntity } from './models.entity';

function isRemoteModelWithId(model: unknown): model is ModelGatewayRemoteModel {
  if (!model || typeof model !== 'object') return false;
  return typeof (model as { id?: unknown }).id === 'string';
}

function toRemoteModelListItem(model: ModelGatewayRemoteModel): RemoteModelListItemResponse {
  const item: RemoteModelListItemResponse = { id: model.id };
  if (typeof model.object === 'string') {
    item.object = model.object;
  }
  if (typeof model.owned_by === 'string') {
    item.owned_by = model.owned_by;
  }
  return item;
}

const RETYPE_KEY_MESSAGE = '请重新填写 API Key';

/**
 * 提交的模型密钥：不是字符串（数组、对象等）直接拒绝；去掉首尾空白后为空或含脱敏占位，表示「沿用已存密钥」；
 * 其余按去空白后的明文使用
 */
function classifySubmittedKey(value: unknown): { kind: 'stored' } | { kind: 'plain'; key: string } {
  if (value === undefined || value === null) return { kind: 'stored' };
  if (typeof value !== 'string') {
    throw new HttpException('API Key 必须是字符串', HttpStatus.BAD_REQUEST);
  }
  const key = value.trim();
  if (!key || isMaskedSecret(key)) return { kind: 'stored' };
  return { kind: 'plain', key };
}

@Injectable()
export class ModelsService implements OnModuleInit {
  constructor(
    @InjectRepository(ModelsEntity)
    private readonly modelsEntity: Repository<ModelsEntity>,
    private readonly redisCacheService: RedisCacheService,
    private readonly modelGatewayService?: ModelGatewayService,
  ) {}

  async onModuleInit() {
    // 初始化时重建缓存，确保缓存数据最新
    const success = await this.updateModelsCache();
    if (!success) {
      Logger.warn('模型缓存初始化失败，将在首次访问时重试', 'ModelsService');
    }
  }

  /* 更新模型缓存到Redis（永久缓存） */
  async updateModelsCache() {
    const cacheKey = 'models:list:all';

    try {
      // 从数据库获取所有启用的模型配置
      const allModels = await this.modelsEntity.find({
        where: { status: true },
        order: { modelOrder: 'ASC' },
      });

      const modelList = allModels.map(model => this.toFrontendModelProjection(model));

      // 去重处理
      const uniqueModelList = Array.from(
        modelList.reduce((map, obj) => map.set(obj.modelName, obj), new Map()).values(),
      );

      // 永久缓存，不设置过期时间
      await this.redisCacheService.set({ key: cacheKey, val: JSON.stringify(uniqueModelList) });
      return true;
    } catch (error) {
      Logger.error(`更新模型缓存失败: ${error.message}`, getErrorStack(error), 'ModelsService');
      return false;
    }
  }

  async getCurrentModelKeyInfo(model: string) {
    // 使用findOne查询特定模型的key信息（仅启用状态）
    const modelKeyInfo = await this.modelsEntity.findOne({
      where: { model: model, status: true },
    });

    if (!modelKeyInfo) {
      return null;
    }

    return modelKeyInfo;
  }

  /* 获取默认启用模型的完整调用配置 */
  async getDefaultModelKeyInfo(): Promise<ModelsEntity | null> {
    const defaultModel = await this.modelsEntity.findOne({
      where: { status: true },
      order: { modelOrder: 'ASC' },
    });

    return defaultModel || null;
  }

  /* 根据模型ID查找模型信息（仅启用状态） */
  async findById(id: number | null | undefined): Promise<ModelsEntity | null> {
    // 查询条件里的 undefined / null 会报错；没有有效 id 时直接视为未找到、不发查询，由调用方走默认模型回退
    if (id === undefined || id === null || Number.isNaN(id)) {
      return null;
    }
    try {
      const model = await this.modelsEntity.findOne({
        where: { id, status: true },
      });
      return model;
    } catch (error) {
      Logger.error(`根据ID查找模型失败: ${error.message}`, 'ModelsService');
      return null;
    }
  }

  /* 根据模型ID查找模型信息（包含未开启模型，用于后台指定的专用通道模型） */
  async findByIdIncludingDisabled(id: number): Promise<ModelsEntity | null> {
    try {
      return await this.modelsEntity.findOne({
        where: { id },
      });
    } catch (error) {
      Logger.error(`根据ID查找模型失败: ${error.message}`, 'ModelsService');
      return null;
    }
  }

  /* 通过现有配置的key和分类给到默认的配置信息 默认给到第一个分类的第一个key的配置 */
  async getBaseConfig(): Promise<any> {
    // 查找modelOrder最小的启用模型
    const minOrderModel = await this.modelsEntity.findOne({
      where: { status: true },
      order: { modelOrder: 'ASC' },
    });

    if (!minOrderModel) {
      // 如果没有启用的模型，尝试找任意一个模型
      const anyModels = await this.modelsEntity.find();
      if (anyModels.length === 0) return;

      return this.formatModelInfo(anyModels[0]);
    }

    return this.formatModelInfo(minOrderModel);
  }

  async getConfigByModelId(id: number, includeDisabled = false): Promise<any | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    const model = includeDisabled
      ? await this.findByIdIncludingDisabled(id)
      : await this.findById(id);
    return model ? this.formatModelInfo(model) : null;
  }

  private formatModelInfo(model: ModelsEntity) {
    return {
      modelInfo: this.toFrontendModelProjection(model),
    };
  }

  private toFrontendModelProjection(model: Partial<ModelsEntity>) {
    return {
      id: model.id,
      modelName: model.modelName,
      model: model.model,
      deduct: model.deduct,
      modelAvatar: model.modelAvatar,
      multimodalTypes: model.multimodalTypes || [],
      protocol: model.protocol || DEFAULT_MODEL_PROTOCOL,
      capabilities: withNormalizedModelGatewayReasoningControl(
        model.capabilities || deriveCapabilitiesFromMultimodalTypes(model.multimodalTypes),
      ),
      modelDescription: model.modelDescription,
      isTokenBased: model.isTokenBased,
      tokenFeeRatio: model.tokenFeeRatio,
      modelLimits: model.modelLimits,
      maxModelTokens: model.maxModelTokens,
    };
  }

  private toFrontendModelList(models: Partial<ModelsEntity>[]) {
    return Array.from(
      models
        .map(model => this.toFrontendModelProjection(model))
        .reduce((map, model) => map.set(model.modelName, model), new Map())
        .values(),
    );
  }

  async setModel(params: SetModelDto) {
    const startTime = Date.now();
    const isUpdate = !!params.id;

    Logger.log(
      `开始${isUpdate ? '更新' : '创建'}模型 - 名称: ${params.modelName}, ID: ${
        params.id || 'new'
      }`,
      'ModelsService.setModel',
    );

    try {
      const { id } = params;
      if (id) {
        // 更新操作 - 处理key字段的类型问题
        const updateData: any = this.normalizeSetModelData(params, { isUpdate: true });
        // 如果key是数组（批量情况），不传递给update；管理端回显的是脱敏值，原样提交表示不修改密钥
        if (Array.isArray(updateData.key) || isMaskedSecret(updateData.key)) {
          delete updateData.key;
        }
        // 移除DTO中存在但Entity中不存在的字段
        delete updateData.drawingType;

        const res = await this.modelsEntity.update({ id }, updateData);
        await this.updateModelsCache();

        const duration = Date.now() - startTime;
        if ((res.affected ?? 0) > 0) {
          Logger.log(
            `模型更新成功 - ID: ${id}, 名称: ${params.modelName}, 耗时: ${duration}ms`,
            'ModelsService.setModel',
          );
        } else {
          Logger.warn(
            `模型更新无影响 - ID: ${id}, 名称: ${params.modelName}`,
            'ModelsService.setModel',
          );
        }
        return (res.affected ?? 0) > 0;
      } else {
        // 创建新模型，统一处理逻辑
        const createData: any = this.normalizeSetModelData(params);
        // 新建没有可沿用的已存密钥：空的、脱敏占位（复制、导入来的）都要求重新填写，不再静默存成空串
        const submitted = classifySubmittedKey(createData.key);
        if (submitted.kind !== 'plain')
          throw new HttpException(RETYPE_KEY_MESSAGE, HttpStatus.BAD_REQUEST);
        createData.key = submitted.key;
        // 移除DTO中存在但Entity中不存在的字段
        delete createData.drawingType;
        const res = await this.modelsEntity.save(createData);
        await this.updateModelsCache();

        const duration = Date.now() - startTime;
        Logger.log(
          `模型创建成功 - ID: ${(res as any).id}, 名称: ${params.modelName}, 耗时: ${duration}ms`,
          'ModelsService.setModel',
        );
        return res;
      }
    } catch (error) {
      // 管理员输入有误（4xx）：提示直接返回，不当作服务端故障记录
      if (error instanceof HttpException && error.getStatus() < 500) throw error;
      const duration = Date.now() - startTime;
      Logger.error(
        `模型${isUpdate ? '更新' : '创建'}失败 - 名称: ${params.modelName}, ` +
          `错误: ${error.message}, 耗时: ${duration}ms`,
        getErrorStack(error),
        'ModelsService.setModel',
      );
      throw error;
    }
  }

  private ensureModelGateway(): ModelGatewayService {
    if (!this.modelGatewayService) {
      throw new HttpException('Model Gateway 未初始化', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return this.modelGatewayService;
  }

  async setModelStatus(params: { id?: number; status?: boolean | string | number }) {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException('缺失有效的模型ID', HttpStatus.BAD_REQUEST);
    }

    const status = this.normalizeBooleanStatus(params.status);
    const res = await this.modelsEntity.update({ id }, { status });
    if (!res.affected) {
      throw new HttpException('模型不存在', HttpStatus.BAD_REQUEST);
    }
    await this.updateModelsCache();
    return true;
  }

  private normalizeBooleanStatus(value: unknown): boolean {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    throw new HttpException('状态参数错误', HttpStatus.BAD_REQUEST);
  }

  private normalizeSetModelData(params: SetModelDto, options: { isUpdate?: boolean } = {}): any {
    const data: any = { ...params };
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
    const isUpdate = !!options.isUpdate;

    delete data.apiKey;
    delete data.proxyUrl;

    if (!isUpdate || hasOwn('protocol')) {
      data.protocol = data.protocol || DEFAULT_MODEL_PROTOCOL;
    }

    if (hasOwn('capabilities') && data.capabilities && typeof data.capabilities === 'string') {
      data.capabilities = JSON.parse(data.capabilities);
    }

    if (!isUpdate || hasOwn('capabilities') || hasOwn('multimodalTypes')) {
      if (!data.capabilities) {
        data.capabilities = deriveCapabilitiesFromMultimodalTypes(data.multimodalTypes);
      }
      data.capabilities = withNormalizedModelGatewayReasoningControl(data.capabilities);
      if (!data.multimodalTypes?.length) {
        data.multimodalTypes = multimodalTypesFromCapabilities(data.capabilities);
      }
    }

    if (!isUpdate || hasOwn('additionalParams')) {
      const additionalParams = parseModelGatewayAdditionalParams(data.additionalParams);
      // 管理员能自行改正的输入：说明是哪些字段，而不是返回通用的服务器错误
      const reserved = findReservedAdditionalParams(additionalParams);
      if (reserved.length) {
        throw new HttpException(
          `附加参数不能包含由系统控制的字段：${reserved.join('、')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (additionalParams) {
        data.additionalParams = JSON.stringify(additionalParams);
      }
    }

    return data;
  }

  resolveModelGatewayConfig(
    model: Partial<ModelsEntity> | null | undefined,
  ): ModelGatewayRuntimeConfig {
    const additionalParams = parseModelGatewayAdditionalParams(model?.additionalParams);
    return {
      protocol:
        (model?.protocol as ModelGatewayRuntimeConfig['protocol']) || DEFAULT_MODEL_PROTOCOL,
      model: String(model?.model || '').trim(),
      apiKey: String(model?.key || '').trim(),
      baseUrl: String(model?.baseUrl || '').trim(),
      endpointPath: model?.endpointPath || undefined,
      capabilities: withNormalizedModelGatewayReasoningControl(
        (model?.capabilities as ModelGatewayCapabilities) ||
          deriveCapabilitiesFromMultimodalTypes(model?.multimodalTypes),
      ),
      additionalParams,
    };
  }

  /**
   * 管理端列表只回显脱敏密钥；测试连接 / 拉取模型列表时提交的密钥为空或仍是脱敏值，
   * 必须按模型 id 取到库里存在且非空的真实密钥才继续，否则 400，脱敏值与空串都不发给上游。
   * 密钥本身不离开服务端。
   */
  private async withStoredSecret<T extends { id?: number | string; key?: unknown }>(
    params: T,
  ): Promise<T> {
    const submitted = classifySubmittedKey(params?.key);
    if (submitted.kind === 'plain') return { ...params, key: submitted.key };
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(RETYPE_KEY_MESSAGE, HttpStatus.BAD_REQUEST);
    }
    const stored = await this.modelsEntity.findOne({
      where: { id },
      select: { id: true, key: true },
    });
    const storedKey = typeof stored?.key === 'string' ? stored.key.trim() : '';
    if (!storedKey || isMaskedSecret(storedKey)) {
      throw new HttpException(RETYPE_KEY_MESSAGE, HttpStatus.BAD_REQUEST);
    }
    return { ...params, key: storedKey };
  }

  async previewRequestUrl(params: any) {
    const config = this.resolveModelGatewayConfig(params);
    return this.ensureModelGateway().previewRequestUrl({
      protocol: config.protocol,
      baseUrl: config.baseUrl,
      model: config.model,
      endpointPath: config.endpointPath,
      operation: params.operation || 'non_stream',
    });
  }

  async testConnection(params: any) {
    const config = this.resolveModelGatewayConfig(await this.withStoredSecret(params));
    return this.ensureModelGateway().testConnection(config);
  }

  async listRemoteModels(params: Partial<ModelsEntity>): Promise<RemoteModelListItemResponse[]> {
    const config = this.resolveModelGatewayConfig(await this.withStoredSecret(params));
    return this.ensureModelGateway()
      .listRemoteModels(config)
      .then(models => models.filter(isRemoteModelWithId).map(toRemoteModelListItem));
  }

  getGatewayProfiles() {
    return this.ensureModelGateway().getProfilePayload();
  }

  async delModel({ id }: { id: number }) {
    if (!id) {
      throw new HttpException('缺失必要参数！', HttpStatus.BAD_REQUEST);
    }
    const m = await this.modelsEntity.findOne({ where: { id } });
    if (!m) {
      throw new HttpException('当前账号不存在！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.modelsEntity.delete({ id });
    await this.updateModelsCache();
    return res;
  }

  async queryModels(req: Request, params: QueryModelDto) {
    requireRequestUser(req);
    const { keyType, key, status, model, page = 1, size = 10 } = params;
    const where: any = {};
    keyType && (where.keyType = keyType);
    model && (where.model = model);
    status && (where.status = Number(status) === 1 ? true : false);
    key && (where.key = Like(`%${key}%`));
    const [rows, count] = await this.modelsEntity.findAndCount({
      where: where,
      order: {
        modelOrder: 'ASC',
      },
      skip: (page - 1) * size,
      take: size,
    });
    // 管理端只回显脱敏密钥；保存时原样提交脱敏值表示不修改
    return {
      rows: rows.map(row => ({
        ...row,
        key: maskSecret(row.key),
        keyConfigured: Boolean(String(row.key || '').trim()),
      })),
      count,
    };
  }

  /* 客户端查询到的所有的配置的模型类别 以及类别下自定义的多少中文模型名称 */
  async modelsList() {
    const cacheKey = 'models:list:all';

    try {
      // 尝试从缓存获取
      const cachedResult = await this.redisCacheService.get({ key: cacheKey });
      if (cachedResult) {
        const parsed = JSON.parse(cachedResult);
        if (Array.isArray(parsed)) {
          return this.toFrontendModelList(parsed);
        }
      }
    } catch (cacheError) {
      Logger.warn(
        `Redis缓存获取失败，从数据库查询: ${cacheError.message}`,
        'ModelsService-modelsList',
      );
    }

    // 缓存未命中或格式不匹配，从数据库查询并更新缓存
    const updateSuccess = await this.updateModelsCache();

    // 如果更新成功，重新尝试从缓存获取
    if (updateSuccess) {
      try {
        const cachedResult = await this.redisCacheService.get({ key: cacheKey });
        if (cachedResult) {
          const parsed = JSON.parse(cachedResult);
          return Array.isArray(parsed) ? this.toFrontendModelList(parsed) : parsed;
        }
      } catch (error) {
        Logger.error(`获取模型列表失败: ${error.message}`, getErrorStack(error), 'ModelsService');
      }
    }

    // 如果还是失败，直接从数据库返回（所有启用的模型）
    const allModels = await this.modelsEntity.find({
      where: { status: true },
      order: { modelOrder: 'ASC' },
    });

    const uniqueModelList = this.toFrontendModelList(allModels);

    // 尝试异步更新Redis缓存，但不阻塞返回
    void this.updateModelsCache().catch(err => {
      Logger.warn(`后台异步缓存更新失败: ${err.message}`, 'ModelsService');
    });

    return uniqueModelList;
  }

  /* 记录使用次数和使用的token数量 */
  async saveUseLog(id: number, useToken: number) {
    await this.modelsEntity
      .createQueryBuilder()
      .update(ModelsEntity)
      .set({
        useCount: () => 'useCount + 1',
        useToken: () => {
          const n = Number(useToken);
          return `useToken + ${Number.isFinite(n) && n > 0 ? n : 0}`;
        },
      })
      .where('id = :id', { id })
      .execute();
  }
}
