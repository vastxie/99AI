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
    private readonly modelsEntity: Repository<ModelsEntity> // @InjectRepository(ModelsTypeEntity) // private readonly modelsTypeEntity: Repository<ModelsTypeEntity>,
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
    const allKeys = await this.modelsEntity.find({ where: { status: true } });
    const keyTypes = allKeys.reduce((pre: any, cur) => {
      if (!pre[cur.keyType]) {
        pre[cur.keyType] = [cur];
      } else {
        pre[cur.keyType].push(cur);
      }
      return pre;
    }, {});
    this.modelTypes = Object.keys(keyTypes).map((keyType) => {
      return { label: ModelsMapCn[keyType], val: keyType };
    });
    this.modelMaps = keyTypes;
    this.keyList = {};

    allKeys.forEach((keyDetail) => {
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

  /* lock key 自动锁定key */
  async lockKey(keyId, remark, keyStatus = -1) {
    const res = await this.modelsEntity.update(
      { id: keyId },
      { status: false, keyStatus, remark }
    );
    Logger.error(`key: ${keyId} 欠费或被官方封禁导致不可用，已被系统自动锁定`);
    this.initCalcKey();
  }

  async getCurrentModelKeyInfo(model: string) {
    // 使用findOne查询特定模型的key信息
    let modelKeyInfo = await this.modelsEntity.findOne({
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

  // async getSpecialModelKeyInfo(modelPrefix) {
  //   // 查找所有包含指定前缀的键名
  //   const modelKeys = Object.keys(this.keyPoolMap).filter(key => key.startsWith(modelPrefix));

  //   if (modelKeys.length === 0) {
  //     throw new HttpException('当前调用模型已经被移除，请重新选择模型！', HttpStatus.BAD_REQUEST);
  //   }

  //   // 选择第一个匹配项
  //   const firstMatchModelKey = modelKeys[0];

  //   // 更新调用下标
  //   this.keyPoolIndexMap[firstMatchModelKey]++;
  //   if (this.keyPoolIndexMap[firstMatchModelKey] >= this.keyPoolMap[firstMatchModelKey].length) {
  //     this.keyPoolIndexMap[firstMatchModelKey] = 0;
  //   }

  //   // 获取对应的键值
  //   const key = this.keyPoolMap[firstMatchModelKey][this.keyPoolIndexMap[firstMatchModelKey]];

  //   // 修改模型名称中的前缀部分
  //   const modifiedModel = firstMatchModelKey.replace(modelPrefix, '');

  //   // 将修改后的模型名称添加到key对象中（假设key对象是个包含model字段的对象）
  //   key.model = modifiedModel;

  //   // 返回包含修改后的模型名称的key对象
  //   return key;
  // }

  async getSpecialModelKeyInfo(modelPrefix) {
    // 使用Like操作符进行模糊查询
    const matchingModels = await this.modelsEntity.find({
      where: { model: Like(`${modelPrefix}%`) },
    });

    if (matchingModels.length === 0) {
      throw new HttpException(
        '未找到匹配的模型，请重新选择模型！',
        HttpStatus.BAD_REQUEST
      );
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
    const {
      keyType,
      modelName,
      model,
      deductType,
      deduct,
      isFileUpload,
      modelAvatar,
      modelDescription,
    } = this.modelMaps[1][0]; // 取到第一个默认的配置项信息
    return {
      modelInfo: {
        keyType,
        modelName,
        model,
        deductType,
        deduct,
        isFileUpload,
        modelAvatar,
        modelDescription,
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
      params.status && (params.keyStatus = 1);
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
          const data = key.map((k) => {
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
    let where: any = {};
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
      rows.forEach((item) => {
        item.key && (item.key = hideString(item.key));
      });
    }

    return { rows, count };
  }

  /* 客户端查询到的所有的配置的模型类别 以及类别下自定义的多少中文模型名称 */
  async modelsList() {
    const cloneModelMaps = JSON.parse(JSON.stringify(this.modelMaps));
    Object.keys(cloneModelMaps).forEach((key) => {
      // 对每个模型进行排序
      cloneModelMaps[key] = cloneModelMaps[key]
        .filter((t) => t.keyStatus === 1) // 筛选出 keyStatus 为 1 的项
        .sort((a, b) => a.modelOrder - b.modelOrder);
      cloneModelMaps[key] = Array.from(
        cloneModelMaps[key]
          .map((t) => {
            const {
              modelName,
              keyType,
              model,
              deduct,
              deductType,
              maxRounds,
              modelAvatar,
              isFileUpload,
              modelDescription,
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
              modelDescription,
            };
          })
          .reduce((map, obj) => map.set(obj.modelName, obj), new Map())
          .values()
      );
    });

    return {
      modelTypeList: this.modelTypes,
      modelMaps: cloneModelMaps,
    };
  }

  async getMjInfo() {
    // 使用findOne查询特定模型的信息
    const modelInfo = await this.modelsEntity.findOne({
      where: { model: 'midjourney' },
    });

    // 如果查询到模型信息，返回相关数据
    if (modelInfo) {
      // 你可以根据需要选择返回哪些字段
      return {
        modelName: modelInfo.modelName,
        model: modelInfo.model,
        deduct: modelInfo.deduct,
        deductType: modelInfo.deductType,
      };
    } else {
      // 如果没有查询到模型信息，可以根据需要处理，比如返回null或者抛出错误
      return null;
    }
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

  /* 获取一张绘画key */
  // async getRandomDrawKey() {
  //   const drawkeys = await this.modelsEntity.findOne({ where: { status: true } })
  //   // if (!drawkeys.length) {
  //   //   throw new HttpException('当前未指定特殊模型KEY、前往后台模型池设置吧！', HttpStatus.BAD_REQUEST)
  //   // }
  //   return getRandomItemFromArray(drawkeys)
  // }

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
}
