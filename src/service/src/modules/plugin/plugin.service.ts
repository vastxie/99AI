import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ModelsService } from '../models/models.service';
import { PluginEntity } from './plugin.entity';

@Injectable()
export class PluginService {
  constructor(
    @InjectRepository(PluginEntity)
    private readonly PluginEntity: Repository<PluginEntity>,
    private readonly modelsService: ModelsService
  ) {}

  // 获取插件列表
  // async pluginList(query: any) {
  //   const { page = 1, size = 100 } = query;
  //   // 查询所有插件
  //   const rows = await this.PluginEntity.find({
  //     order: { sortOrder: 'ASC', id: 'DESC' },
  //     skip: (page - 1) * size,
  //     take: size,
  //   });
  //   // console.log(rows);

  //   // 返回结果
  //   return { rows, count: rows.length };
  // }

  async pluginList(query: any) {
    const { page = 1, size = 100 } = query;
    // 查询所有插件
    const rows = await this.PluginEntity.find({
      order: { sortOrder: 'ASC', id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    // 处理插件列表
    const processedRows = await Promise.all(
      rows.map(async (plugin) => {
        try {
          const parameters = await this.modelsService.getCurrentModelKeyInfo(
            plugin.parameters
          );
          const deductType = parameters.deductType;

          // 将 parameters 和 deductType 作为附加参数返回
          return {
            ...plugin,
            deductType,
          };
        } catch (error) {
          // 出现异常时返回 deductType 为 0
          return {
            ...plugin,
            deductType: 0,
          };
        }
      })
    );

    // 过滤掉为 null 的插件
    const filteredRows = processedRows.filter((plugin) => plugin !== null);

    // 返回结果
    return { rows: filteredRows, count: filteredRows.length };
  }

  // 创建插件
  async createPlugin(body: any) {
    const { name, pluginImg, description, isEnabled, parameters, sortOrder } =
      body;

    // 检查插件名称是否存在
    const existingPlugin = await this.PluginEntity.findOne({
      where: { name },
    });
    if (existingPlugin) {
      throw new HttpException('该插件名称已存在！', HttpStatus.BAD_REQUEST);
    }

    // 创建新的插件实体
    const newPlugin = this.PluginEntity.create({
      name,
      pluginImg,
      description,
      isEnabled: isEnabled !== undefined ? isEnabled : 1, // 默认启用
      parameters,
      sortOrder: sortOrder !== undefined ? sortOrder : 0, // 默认排序值
    });

    // 保存新插件
    return await this.PluginEntity.save(newPlugin);
  }

  // 修改插件
  async updatePlugin(body: any) {
    const {
      id,
      name,
      pluginImg,
      description,
      isEnabled,
      parameters,
      sortOrder,
    } = body;

    // 检查插件ID是否存在
    const existingPlugin = await this.PluginEntity.findOne({
      where: { id },
    });
    if (!existingPlugin) {
      throw new HttpException('插件不存在！', HttpStatus.BAD_REQUEST);
    }

    // 检查插件名称是否存在，排除当前插件ID
    const duplicatePlugin = await this.PluginEntity.findOne({
      where: { name, id: Not(id) },
    });
    if (duplicatePlugin) {
      throw new HttpException('该插件名称已存在！', HttpStatus.BAD_REQUEST);
    }

    // 更新插件实体
    existingPlugin.name = name;
    existingPlugin.pluginImg = pluginImg;
    existingPlugin.description = description;
    existingPlugin.isEnabled =
      isEnabled !== undefined ? isEnabled : existingPlugin.isEnabled;
    existingPlugin.parameters = parameters;
    existingPlugin.sortOrder =
      sortOrder !== undefined ? sortOrder : existingPlugin.sortOrder;

    // 保存修改后的插件
    await this.PluginEntity.save(existingPlugin);

    return '修改插件信息成功';
  }

  // 删除插件
  async delPlugin(body: PluginEntity) {
    const { id } = body;

    // 检查插件是否存在
    const existingPlugin = await this.PluginEntity.findOne({
      where: { id },
    });
    if (!existingPlugin) {
      throw new HttpException('该插件不存在！', HttpStatus.BAD_REQUEST);
    }

    // 删除插件
    const deleteResult = await this.PluginEntity.delete(id);

    // 检查是否成功删除插件
    if (deleteResult.affected > 0) {
      return '删除插件成功';
    } else {
      throw new HttpException('删除插件失败！', HttpStatus.BAD_REQUEST);
    }
  }
}
