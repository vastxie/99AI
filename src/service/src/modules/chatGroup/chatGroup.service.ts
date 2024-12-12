import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Request } from 'express';
import * as pdf from 'pdf-parse';
import { In, Repository } from 'typeorm';
import { AppEntity } from '../app/app.entity';
import { ModelsService } from '../models/models.service';
import { ChatGroupEntity } from './chatGroup.entity';
import { CreateGroupDto } from './dto/createGroup.dto';
import { DelGroupDto } from './dto/delGroup.dto';
import { UpdateGroupDto } from './dto/updateGroup.dto';

@Injectable()
export class ChatGroupService {
  constructor(
    @InjectRepository(ChatGroupEntity)
    private readonly chatGroupEntity: Repository<ChatGroupEntity>,
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    private readonly modelsService: ModelsService
  ) {}

  // async create(body: CreateGroupDto, req: Request) {
  //   const { id } = req.user;
  //   const { appId, modelConfig: bodyModelConfig } = body;

  //   // 尝试使用从请求体中提供的 modelConfig，否则获取默认配置
  //   let modelConfig = bodyModelConfig;
  //   if (!modelConfig) {
  //     modelConfig = await this.modelsService.getBaseConfig(appId);
  //     if (!modelConfig) {
  //       throw new HttpException('管理员未配置任何AI模型、请先联系管理员开通聊天模型配置！', HttpStatus.BAD_REQUEST);
  //     }
  //   }

  //   // 初始化创建对话组的参数
  //   const params = { title: '新对话', userId: id };
  //   if (appId) {
  //     // 查找应用信息
  //     const appInfo = await this.appEntity.findOne({ where: { id: appId } });
  //     if (!appInfo) {
  //       throw new HttpException('非法操作、您在使用一个不存在的应用！', HttpStatus.BAD_REQUEST);
  //     }
  //     console.log('开始提取应用信息并进行验证');

  //     // 提取应用信息并进行必要的验证
  //     const { status, name, isFixedModel, isGPTs, appModel } = appInfo;
  //     modelConfig.modelInfo.isGPTs = isGPTs;
  //     modelConfig.modelInfo.isFixedModel = isFixedModel;
  //     modelConfig.modelInfo.modelName = name;
  //     if (isGPTs === 1 || isFixedModel === 1) {
  //       const appModelKey = await this.modelsService.getCurrentModelKeyInfo(isFixedModel === 1 ? appModel : 'gpts');
  //       modelConfig.modelInfo.deductType = appModelKey.deductType
  //       modelConfig.modelInfo.deduct = appModelKey.deduct
  //       modelConfig.modelInfo.model = appModel;
  //       modelConfig.modelInfo.isFileUpload = appModelKey.isFileUpload
  //     }

  //     // const existingGroupCount = await this.chatGroupEntity.count({ where: { userId: id, appId, isDelete: false } });
  //     // if (existingGroupCount > 0) {
  //     //   throw new HttpException('当前应用已经开启了一个对话无需新建了！', HttpStatus.BAD_REQUEST);
  //     // }
  //     if (![1, 3, 4, 5].includes(status)) {
  //       throw new HttpException('非法操作、您在使用一个未启用的应用！', HttpStatus.BAD_REQUEST);
  //     }

  //     // 如果有名称，则设置对话组标题
  //     if (name) {
  //       params['title'] = name;
  //     }
  //     params['appId'] = appId;
  //   }
  //   // 创建新的聊天组并保存
  //   console.log('最终的 modelConfig.modelInfo:', modelConfig);
  //   const newGroup = await this.chatGroupEntity.save({ ...params, config: JSON.stringify(modelConfig) });
  //   return newGroup;
  // }

  async create(body: CreateGroupDto, req: Request) {
    const { id } = req.user; // 从请求中获取用户ID
    const { appId, modelConfig: bodyModelConfig, params } = body; // 从请求体中提取appId和modelConfig

    // 尝试使用从请求体中提供的 modelConfig，否则获取默认配置
    let modelConfig =
      bodyModelConfig || (await this.modelsService.getBaseConfig());
    if (!modelConfig) {
      throw new HttpException(
        '管理员未配置任何AI模型、请先联系管理员开通聊天模型配置！',
        HttpStatus.BAD_REQUEST
      );
    }

    // 使用 JSON.parse(JSON.stringify(object)) 进行深拷贝以避免直接修改原对象
    modelConfig = JSON.parse(JSON.stringify(modelConfig));

    // 初始化创建对话组的参数
    const groupParams = { title: '新对话', userId: id, appId, params };
    // const params = { title: 'New chat', userId: id };

    // 如果指定了appId，查找并验证应用信息
    if (appId) {
      const appInfo = await this.appEntity.findOne({ where: { id: appId } });
      if (!appInfo) {
        throw new HttpException(
          '非法操作、您在使用一个不存在的应用！',
          HttpStatus.BAD_REQUEST
        );
      }

      // 应用存在，提取并验证应用信息
      const { status, name, isFixedModel, isGPTs, appModel, coverImg } =
        appInfo;

      // 更新 modelConfig 以反映应用的特定配置
      Object.assign(modelConfig.modelInfo, {
        isGPTs,
        isFixedModel,
        modelAvatar: coverImg,
        modelName: name,
      });

      // 如果是固定模型或GPTs模型，获取并设置额外的模型信息
      if (isGPTs === 1 || isFixedModel === 1) {
        const appModelKey = await this.modelsService.getCurrentModelKeyInfo(
          isFixedModel === 1 ? appModel : 'gpts'
        );
        Object.assign(modelConfig.modelInfo, {
          deductType: appModelKey.deductType,
          deduct: appModelKey.deduct,
          model: appModel,
          isFileUpload: appModelKey.isFileUpload,
        });
      }

      // 检查应用状态是否允许创建对话组
      if (![1, 3, 4, 5].includes(status)) {
        throw new HttpException(
          '非法操作、您在使用一个未启用的应用！',
          HttpStatus.BAD_REQUEST
        );
      }

      // 如果应用有名称，则使用它作为对话组标题
      if (name) {
        groupParams.title = name;
      }
    }

    // 创建新的聊天组并保存
    const newGroup = await this.chatGroupEntity.save({
      ...groupParams,
      config: JSON.stringify(modelConfig), // 将 modelConfig 对象转换为 JSON 字符串进行保存
    });

    return newGroup; // 返回新创建的聊天组
  }

  async query(req: Request) {
    try {
      const { id } = req.user;
      const params = { userId: id, isDelete: false };
      const res = await this.chatGroupEntity.find({
        where: params,
        order: { isSticky: 'DESC', updatedAt: 'DESC' },
      });
      return res;
      // const res = await this.chatGroupEntity.find({ where: params, order: { isSticky: 'DESC', id: 'DESC' } });
      const appIds = res.filter((t) => t.appId).map((t) => t.appId);
      const appInfos = await this.appEntity.find({ where: { id: In(appIds) } });
      return res.map((item: any) => {
        item.appLogo = appInfos.find((t) => t.id === item.appId)?.coverImg;
        return item;
      });
    } catch (error) {
      console.log('error: ', error);
    }
  }

  async update(body: UpdateGroupDto, req: Request) {
    const { title, isSticky, groupId, config, fileUrl } = body;
    const { id } = req.user;
    const g = await this.chatGroupEntity.findOne({
      where: { id: groupId, userId: id },
    });
    if (!g) {
      throw new HttpException(
        '请先选择一个对话或者新加一个对话再操作！',
        HttpStatus.BAD_REQUEST
      );
    }
    const { appId } = g;
    if (appId && !title) {
      try {
        const parseData = JSON.parse(config);
        if (Number(parseData.keyType) !== 1) {
          throw new HttpException(
            '应用对话名称不能修改哟！',
            HttpStatus.BAD_REQUEST
          );
        }
      } catch (error) {
        // ignore
      }
    }
    const data = {};
    title && (data['title'] = title);
    typeof isSticky !== 'undefined' && (data['isSticky'] = isSticky);
    config && (data['config'] = config);
    fileUrl && (data['fileUrl'] = fileUrl);
    const u = await this.chatGroupEntity.update({ id: groupId }, data);
    if (u.affected) {
      // 如果 fileUrl 不为空，异步处理 PDF 内容读取
      if (fileUrl) {
        this.handlePdfExtraction(fileUrl, groupId);
      }
      return true;
    } else {
      throw new HttpException('更新对话失败！', HttpStatus.BAD_REQUEST);
    }
  }

  // 异步处理 PDF 内容读取
  private async handlePdfExtraction(fileUrl: string, groupId: number) {
    try {
      const pdfText = await this.extractPdfText(fileUrl);
      await this.chatGroupEntity.update(
        { id: groupId },
        { pdfTextContent: pdfText }
      );
    } catch (error) {
      // 处理错误情况，例如记录日志
      console.error('PDF 读取失败:', error);
    }
  }

  // 从 PDF 文件 URL 中提取文本内容
  private async extractPdfText(fileUrl: string): Promise<string> {
    try {
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
      });
      const dataBuffer = Buffer.from(response.data);
      const pdfData = await pdf(dataBuffer);
      return pdfData.text;
    } catch (error) {
      console.error('PDF 解析失败:', error);
      throw new Error('PDF 解析失败');
    }
  }

  async updateTime(groupId: number) {
    await this.chatGroupEntity.update(groupId, {
      updatedAt: new Date(),
    });
  }

  async del(body: DelGroupDto, req: Request) {
    const { groupId } = body;
    const { id } = req.user;
    const g = await this.chatGroupEntity.findOne({
      where: { id: groupId, userId: id },
    });
    if (!g) {
      throw new HttpException(
        '非法操作、您在删除一个非法资源！',
        HttpStatus.BAD_REQUEST
      );
    }
    const r = await this.chatGroupEntity.update(
      { id: groupId },
      { isDelete: true }
    );
    if (r.affected) {
      return '删除成功';
    } else {
      throw new HttpException('删除失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除非置顶开启的所有对话记录 */
  async delAll(req: Request) {
    const { id } = req.user;
    const r = await this.chatGroupEntity.update(
      { userId: id, isSticky: false, isDelete: false },
      { isDelete: true }
    );
    if (r.affected) {
      return '删除成功';
    } else {
      throw new HttpException('删除失败！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 通过groupId查询当前对话组的详细信息 */
  async getGroupInfoFromId(id) {
    if (!id) return;
    const groupInfo = await this.chatGroupEntity.findOne({ where: { id } });
    if (groupInfo) {
      const { pdfTextContent, ...rest } = groupInfo;
      return rest;
    }
  }

  async getGroupPdfText(groupId: number) {
    const groupInfo = await this.chatGroupEntity.findOne({
      where: { id: groupId },
    });
    if (groupInfo) {
      return groupInfo.pdfTextContent;
    }
  }
}
