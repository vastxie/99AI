import { ModelsMapCn } from '@/common/constants/status.constant';
import { hideString } from '@/common/utils';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { QueryModelDto } from './dto/queryModel.dto';
import { SetModelDto } from './dto/setModel.dto';
import { ModelsEntity } from './models.entity';
// import { ModelsTypeEntity } from './modelType.entity';
import { QueryModelTypeDto } from './dto/queryModelType.dto';
import { SetModelTypeDto } from './dto/setModelType.dto';

@Injectable()
export class ModelsService {
  constructor(
    @InjectRepository(ModelsEntity)
    private readonly modelsEntity: Repository<ModelsEntity>, // @InjectRepository(ModelsTypeEntity) // private readonly modelsTypeEntity: Repository<ModelsTypeEntity>,
  ) {}

  private modelTypes = [];
  private modelMaps = {};
  private keyList = {};

  private keyPoolMap = {}; // 记录每个模型的所有key 并且记录顺序
  private keyPoolIndexMap = {}; // 记录每个模型的当前调用的下标

  async onModuleInit() {
    await this.initCalcKey();
  }

  /* 初始化整理所有key 进行分类并且默认一个初始模型配置 默认是配置的第一个分类的第一个key为准 */
  async initCalcKey() {
    this.keyPoolMap = {};
    this.keyPoolIndexMap = {};
    this.keyList = {};
    this.modelMaps = {};
    this.modelTypes = [];
    const allKeys = await this.modelsEntity.find();
    const keyTypes = allKeys.reduce((pre: any, cur) => {
      if (!pre[cur.keyType]) {
        pre[cur.keyType] = [cur];
      } else {
        pre[cur.keyType].push(cur);
      }
      return pre;
    }, {});
    this.modelTypes = Object.keys(keyTypes).map(keyType => {
      return { label: ModelsMapCn[keyType], val: keyType };
    });
    this.modelMaps = keyTypes;
    this.keyList = {};

    allKeys.forEach(keyDetail => {
      const { keyType, model } = keyDetail;

      // 初始化 keyPoolMap 中的 model 数组
      if (!this.keyPoolMap[model]) this.keyPoolMap[model] = [];
      this.keyPoolMap[model].push(keyDetail);

      // 初始化 keyPoolIndexMap 中的 model 索引
      if (!this.keyPoolIndexMap[model]) this.keyPoolIndexMap[model] = 0;

      // 初始化 keyList 中的 keyType 和 model 层次结构
      if (!this.keyList[keyType]) this.keyList[keyType] = {};
      if (!this.keyList[keyType][model]) this.keyList[keyType][model] = [];
      this.keyList[keyType][model].push(keyDetail);
    });
  }

  async getCurrentModelKeyInfo(model: string) {
    // 使用findOne查询特定模型的key信息
    const modelKeyInfo = await this.modelsEntity.findOne({
      where: { model: model },
    });

    // 检查是否找到了模型的key信息
    if (!modelKeyInfo) {
      // const openaiBaseModel = await this.globalConfigService.getConfigs([
      //   'openaiBaseModel',
      // ]);
      // modelKeyInfo = await this.modelsEntity.findOne({
      //   where: { model: openaiBaseModel },
      // });
      // throw new HttpException(
      //   '当前调用模型的key未找到，请重新选择模型！',
      //   HttpStatus.BAD_REQUEST
      // );
      // Logger.debug('当前调用模型的key未找到，请重新选择模型！');
      return null;
    }

    // 假设modelKeyInfo对象有一个属性key存储模型的key
    return modelKeyInfo;
  }

  async getSpecialModelKeyInfo(modelPrefix) {
    // 使用Like操作符进行模糊查询
    const matchingModels = await this.modelsEntity.find({
      where: { model: Like(`${modelPrefix}%`) },
    });

    if (matchingModels.length === 0) {
      throw new HttpException('未找到匹配的模型，请重新选择模型！', HttpStatus.BAD_REQUEST);
    }

    // 选择第一个匹配的模型
    const firstMatchModel = matchingModels[0];

    // 去除model名称中的前缀
    // 假设这里的modelPrefix正是你想从模型名称中去除的前缀部分
    const modifiedModelName = firstMatchModel.model.replace(modelPrefix, '');

    // 如果你需要在返回的对象中保留原始的model名称，可以复制对象并修改
    // 如果直接修改firstMatchModel对象也是可行的，这取决于你的具体需求
    const modifiedModel = {
      ...firstMatchModel,
      model: modifiedModelName,
    };

    // 直接返回修改后的模型信息
    return modifiedModel;
  }

  /* 通过现有配置的key和分类给到默认的配置信息 默认给到第一个分类的第一个key的配置 */
  async getBaseConfig(): Promise<any> {
    if (!this.modelTypes.length || !Object.keys(this.modelMaps).length) return;

    // 查找所有模型中modelOrder最小的模型
    let minOrderModel = null;
    let minOrder = Infinity;

    // 遍历所有keyType
    for (const keyType in this.modelMaps) {
      // 遍历当前keyType下的所有模型
      for (const model of this.modelMaps[keyType]) {
        // 检查模型状态并比较modelOrder
        if (model.status === true && model.modelOrder < minOrder) {
          minOrder = model.modelOrder;
          minOrderModel = model;
        }
      }
    }

    // 如果没有找到启用状态的模型，则回退到原来的默认逻辑
    if (!minOrderModel && this.modelMaps[1] && this.modelMaps[1][0]) {
      minOrderModel = this.modelMaps[1][0];
    }

    // 如果仍然没有可用模型，返回undefined
    if (!minOrderModel) return;

    const {
      keyType,
      modelName,
      model,
      deductType,
      deduct,
      isFileUpload,
      isImageUpload,
      modelAvatar,
      modelDescription,
      isNetworkSearch,
      deepThinkingType,
      deductDeepThink,
      isMcpTool,
      systemPrompt,
      systemPromptType,
    } = minOrderModel;

    return {
      modelInfo: {
        keyType,
        modelName,
        model,
        deductType,
        deduct,
        isFileUpload,
        isImageUpload,
        modelAvatar,
        modelDescription,
        isNetworkSearch,
        deepThinkingType,
        deductDeepThink,
        isMcpTool,
        systemPrompt,
        systemPromptType,
      },
    };
  }

  async setModel(params: SetModelDto) {
    try {
      // 检查并处理NaN值
      if (isNaN(params.timeout)) {
        // 如果timeout是NaN，则可以选择设置为null或者一个默认值
        params.timeout = null; // 或者任何合适的默认值，如0
      }
      const { id } = params;
      if (id) {
        const res = await this.modelsEntity.update({ id }, params);
        await this.initCalcKey();
        return res.affected > 0;
      } else {
        const { keyType, key } = params;
        if (Number(keyType !== 1)) {
          const res = await this.modelsEntity.save(params);
          await this.initCalcKey();
          return res;
        } else {
          const data = key.map(k => {
            try {
              const data = JSON.parse(JSON.stringify(params));
              data.key = k;
              // 对于每个key的处理中也检查NaN
              if (isNaN(data.timeout)) {
                data.timeout = null; // 同样处理NaN
              }
              return data;
            } catch (error) {
              console.log('parse error: ', error);
            }
          });
          const res = await this.modelsEntity.save(data);
          await this.initCalcKey();
          return res;
        }
      }
    } catch (error) {
      console.log('error: ', error);
    }
  }

  async delModel({ id }) {
    if (!id) {
      throw new HttpException('缺失必要参数！', HttpStatus.BAD_REQUEST);
    }
    const m = await this.modelsEntity.findOne({ where: { id } });
    if (!m) {
      throw new HttpException('当前账号不存在！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.modelsEntity.delete({ id });
    await this.initCalcKey();
    return res;
  }

  async queryModels(req, params: QueryModelDto) {
    const { role } = req.user;
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
    if (role !== 'super') {
      rows.forEach(item => {
        item.key && (item.key = hideString(item.key));
      });
    }

    return { rows, count };
  }

  /* 客户端查询到的所有的配置的模型类别 以及类别下自定义的多少中文模型名称 */
  async modelsList() {
    const cloneModelMaps = JSON.parse(JSON.stringify(this.modelMaps));
    Object.keys(cloneModelMaps).forEach(key => {
      // 对每个模型进行排序，同时过滤掉 status 为 false 的模型
      cloneModelMaps[key] = cloneModelMaps[key]
        .filter(t => t.status === true) // 只保留 status 为 true 的模型
        .sort((a, b) => a.modelOrder - b.modelOrder);
      cloneModelMaps[key] = Array.from(
        cloneModelMaps[key]
          .map(t => {
            const {
              modelName,
              keyType,
              model,
              deduct,
              deductType,
              maxRounds,
              modelAvatar,
              isFileUpload,
              isImageUpload,
              modelDescription,
              isNetworkSearch,
              deepThinkingType,
              deductDeepThink,
              isMcpTool,
            } = t;
            return {
              modelName,
              keyType,
              model,
              deduct,
              deductType,
              maxRounds,
              modelAvatar,
              isFileUpload,
              isImageUpload,
              modelDescription,
              isNetworkSearch,
              deepThinkingType,
              deductDeepThink,
              isMcpTool,
            };
          })
          .reduce((map, obj) => map.set(obj.modelName, obj), new Map())
          .values(),
      );
    });

    return {
      modelTypeList: this.modelTypes,
      modelMaps: cloneModelMaps,
    };
  }

  /* 记录使用次数和使用的token数量 */
  async saveUseLog(id, useToken) {
    await this.modelsEntity
      .createQueryBuilder()
      .update(ModelsEntity)
      .set({
        useCount: () => 'useCount + 1',
        useToken: () => `useToken + ${useToken}`,
      })
      .where('id = :id', { id })
      .execute();
  }

  /* 获取所有key */
  async getAllKey() {
    return await this.modelsEntity.find();
  }

  /* 查询模型类型 */
  async queryModelType(params: QueryModelTypeDto) {
    return 1;
  }

  /* 创建修改模型类型 */
  async setModelType(params: SetModelTypeDto) {
    return 1;
  }

  /* 删除模型类型 */
  async delModelType(params) {
    return 1;
  }

  /* 通过模型名称查询模型详细属性 */
  async getModelDetailByName(model: string) {
    Logger.debug(`getModelDetailByName:${model}`);
    if (!model) {
      throw new HttpException('模型名称不能为空', HttpStatus.BAD_REQUEST);
    }

    try {
      // 先尝试精确匹配
      let modelDetail = await this.modelsEntity.findOne({
        where: { model: model },
      });

      // 如果没找到，尝试模糊匹配
      if (!modelDetail) {
        const models = await this.modelsEntity.find({
          where: { model: Like(`%${model}%`) },
        });

        if (models.length > 0) {
          modelDetail = models[0]; // 取第一个匹配结果
        }
      }

      Logger.debug(`modelDetail: ${modelDetail}`);

      if (!modelDetail) {
        throw new HttpException('未找到指定模型', HttpStatus.NOT_FOUND);
      }

      // 返回模型详细信息
      return {
        id: modelDetail.id,
        modelName: modelDetail.modelName,
        model: modelDetail.model,
        keyType: modelDetail.keyType,
        deduct: modelDetail.deduct,
        deductType: modelDetail.deductType,
        maxRounds: modelDetail.maxRounds,
        modelAvatar: modelDetail.modelAvatar,
        isFileUpload: modelDetail.isFileUpload,
        isImageUpload: modelDetail.isImageUpload,
        modelDescription: modelDetail.modelDescription,
        isNetworkSearch: modelDetail.isNetworkSearch,
        deepThinkingType: modelDetail.deepThinkingType,
        deductDeepThink: modelDetail.deductDeepThink,
        modelOrder: modelDetail.modelOrder,
        isMcpTool: modelDetail.isMcpTool,
        systemPrompt: modelDetail.systemPrompt,
        systemPromptType: modelDetail.systemPromptType,
        drawingType: modelDetail.drawingType,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(`获取模型详情失败: ${error.message}`, 'ModelsService');
      throw new HttpException('获取模型详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
