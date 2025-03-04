"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const models_service_1 = require("../models/models.service");
const plugin_entity_1 = require("./plugin.entity");
let PluginService = class PluginService {
    constructor(PluginEntity, modelsService) {
        this.PluginEntity = PluginEntity;
        this.modelsService = modelsService;
    }
    async pluginList(query) {
        const { page = 1, size = 100 } = query;
        const rows = await this.PluginEntity.find({
            order: { sortOrder: 'ASC', id: 'DESC' },
            skip: (page - 1) * size,
            take: size,
        });
        const processedRows = await Promise.all(rows.map(async (plugin) => {
            try {
                const parameters = await this.modelsService.getCurrentModelKeyInfo(plugin.parameters);
                const deductType = parameters.deductType;
                return Object.assign(Object.assign({}, plugin), { deductType });
            }
            catch (error) {
                return Object.assign(Object.assign({}, plugin), { deductType: 0 });
            }
        }));
        const filteredRows = processedRows.filter((plugin) => plugin !== null);
        return { rows: filteredRows, count: filteredRows.length };
    }
    async createPlugin(body) {
        const { name, pluginImg, description, isEnabled, parameters, sortOrder } = body;
        const existingPlugin = await this.PluginEntity.findOne({
            where: { name },
        });
        if (existingPlugin) {
            throw new common_1.HttpException('该插件名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const newPlugin = this.PluginEntity.create({
            name,
            pluginImg,
            description,
            isEnabled: isEnabled !== undefined ? isEnabled : 1,
            parameters,
            sortOrder: sortOrder !== undefined ? sortOrder : 0,
        });
        return await this.PluginEntity.save(newPlugin);
    }
    async updatePlugin(body) {
        const { id, name, pluginImg, description, isEnabled, parameters, sortOrder, } = body;
        const existingPlugin = await this.PluginEntity.findOne({
            where: { id },
        });
        if (!existingPlugin) {
            throw new common_1.HttpException('插件不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const duplicatePlugin = await this.PluginEntity.findOne({
            where: { name, id: (0, typeorm_2.Not)(id) },
        });
        if (duplicatePlugin) {
            throw new common_1.HttpException('该插件名称已存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        existingPlugin.name = name;
        existingPlugin.pluginImg = pluginImg;
        existingPlugin.description = description;
        existingPlugin.isEnabled =
            isEnabled !== undefined ? isEnabled : existingPlugin.isEnabled;
        existingPlugin.parameters = parameters;
        existingPlugin.sortOrder =
            sortOrder !== undefined ? sortOrder : existingPlugin.sortOrder;
        await this.PluginEntity.save(existingPlugin);
        return '修改插件信息成功';
    }
    async delPlugin(body) {
        const { id } = body;
        const existingPlugin = await this.PluginEntity.findOne({
            where: { id },
        });
        if (!existingPlugin) {
            throw new common_1.HttpException('该插件不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const deleteResult = await this.PluginEntity.delete(id);
        if (deleteResult.affected > 0) {
            return '删除插件成功';
        }
        else {
            throw new common_1.HttpException('删除插件失败！', common_1.HttpStatus.BAD_REQUEST);
        }
    }
};
PluginService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plugin_entity_1.PluginEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        models_service_1.ModelsService])
], PluginService);
exports.PluginService = PluginService;
