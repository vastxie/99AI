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
exports.ModelsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const models_entity_1 = require("./models.entity");
const status_constant_1 = require("../../common/constants/status.constant");
const baidu_1 = require("../chatgpt/baidu");
const utils_1 = require("../../common/utils");
const modelType_entity_1 = require("./modelType.entity");
let ModelsService = class ModelsService {
    constructor(modelsEntity, modelsTypeEntity) {
        this.modelsEntity = modelsEntity;
        this.modelsTypeEntity = modelsTypeEntity;
        this.modelTypes = [];
        this.modelMaps = {};
        this.keyList = {};
        this.keyPoolMap = {};
        this.keyPoolIndexMap = {};
    }
    async onModuleInit() {
        await this.initCalcKey();
        this.refreshBaiduAccesstoken();
    }
    async initCalcKey() {
        this.keyPoolMap = {};
        this.keyPoolIndexMap = {};
        this.keyList = {};
        this.modelMaps = {};
        this.modelTypes = [];
        const allKeys = await this.modelsEntity.find({ where: { status: true } });
        const keyTypes = allKeys.reduce((pre, cur) => {
            if (!pre[cur.keyType]) {
                pre[cur.keyType] = [cur];
            }
            else {
                pre[cur.keyType].push(cur);
            }
            return pre;
        }, {});
        this.modelTypes = Object.keys(keyTypes).map(keyType => {
            return { label: status_constant_1.ModelsMapCn[keyType], val: keyType };
        });
        this.modelMaps = keyTypes;
        this.keyList = {};
        allKeys.forEach(keyDetail => {
            const { keyType, model, keyWeight } = keyDetail;
            if (!this.keyPoolMap[model])
                this.keyPoolMap[model] = [];
            for (let index = 0; index < keyWeight; index++) {
                this.keyPoolMap[model].push(keyDetail);
            }
            if (!this.keyPoolIndexMap[model])
                this.keyPoolIndexMap[model] = 0;
            if (!this.keyList[keyType])
                this.keyList[keyType] = {};
            if (!this.keyList[keyType][model])
                this.keyList[keyType][model] = [];
            this.keyList[keyType][model].push(keyDetail);
        });
    }
    async lockKey(keyId, remark, keyStatus = -1) {
        const res = await this.modelsEntity.update({ id: keyId }, { status: false, keyStatus, remark });
        common_1.Logger.error(`key: ${keyId} 欠费或被官方封禁导致不可用，已被系统自动锁定`);
        this.initCalcKey();
    }
    async getCurrentModelKeyInfo(model) {
        if (!this.keyPoolMap[model]) {
            throw new common_1.HttpException('当前调用模型已经被移除、请重新选择模型！', common_1.HttpStatus.BAD_REQUEST);
        }
        this.keyPoolIndexMap[model]++;
        const index = this.keyPoolIndexMap[model];
        if (index >= this.keyPoolMap[model].length)
            this.keyPoolIndexMap[model] = 0;
        const key = this.keyPoolMap[model][this.keyPoolIndexMap[model]];
        return key;
    }
    async getBaseConfig(appId) {
        if (!this.modelTypes.length || !Object.keys(this.modelMaps).length)
            return;
        const modelTypeInfo = appId ? this.modelTypes.find(item => Number(item.val) === 1) : this.modelTypes[0];
        if (!modelTypeInfo)
            return;
        const { keyType, modelName, model, maxModelTokens, maxResponseTokens, deductType, deduct, maxRounds } = this.modelMaps[modelTypeInfo.val][0];
        return {
            modelTypeInfo,
            modelInfo: { keyType, modelName, model, maxModelTokens, maxResponseTokens, topN: 0.8, systemMessage: '', deductType, deduct, maxRounds, rounds: 8 }
        };
    }
    async setModel(params) {
        try {
            const { id } = params;
            params.status && (params.keyStatus = 1);
            if (id) {
                const res = await this.modelsEntity.update({ id }, params);
                await this.initCalcKey();
                return res.affected > 0;
            }
            else {
                const { keyType, key } = params;
                if (Number(keyType !== 1)) {
                    const res = await this.modelsEntity.save(params);
                    await this.initCalcKey();
                    if (keyType === 2) {
                        this.refreshBaiduAccesstoken();
                    }
                    return res;
                }
                else {
                    const data = key.map(k => {
                        try {
                            const data = JSON.parse(JSON.stringify(params));
                            data.key = k;
                            return data;
                        }
                        catch (error) {
                            console.log('parse error: ', error);
                        }
                    });
                    const res = await this.modelsEntity.save(data);
                    await this.initCalcKey();
                    return res;
                }
            }
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async delModel({ id }) {
        if (!id) {
            throw new common_1.HttpException('缺失必要参数！', common_1.HttpStatus.BAD_REQUEST);
        }
        const m = await this.modelsEntity.findOne({ where: { id } });
        if (!m) {
            throw new common_1.HttpException('当前账号不存在！', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.modelsEntity.delete({ id });
        await this.initCalcKey();
        return res;
    }
    async queryModels(req, params) {
        const { role } = req.user;
        const { keyType, key, status, model, page = 1, size = 10 } = params;
        let where = {};
        keyType && (where.keyType = keyType);
        model && (where.model = model);
        status && (where.status = Number(status) === 1 ? true : false);
        key && (where.key = (0, typeorm_2.Like)(`%${key}%`));
        const [rows, count] = await this.modelsEntity.findAndCount({
            where: where,
            skip: (page - 1) * size,
            take: size,
        });
        if (role !== 'super') {
            rows.forEach(item => {
                item.key && (item.key = (0, utils_1.hideString)(item.key));
                item.secret && (item.secret = (0, utils_1.hideString)(item.secret));
            });
        }
        return { rows, count };
    }
    async modelsList() {
        const cloneModelMaps = JSON.parse(JSON.stringify(this.modelMaps));
        Object.keys(cloneModelMaps).forEach(key => {
            cloneModelMaps[key] = Array.from(cloneModelMaps[key].map(t => {
                const { modelName, model, deduct, deductType, maxRounds } = t;
                return { modelName, model, deduct, deductType, maxRounds };
            }).reduce((map, obj) => map.set(obj.modelName, obj), new Map()).values());
        });
        return {
            modelTypeList: this.modelTypes,
            modelMaps: cloneModelMaps
        };
    }
    async saveUseLog(id, useToken) {
        await this.modelsEntity
            .createQueryBuilder()
            .update(models_entity_1.ModelsEntity)
            .set({ useCount: () => 'useCount + 1', useToken: () => `useToken + ${useToken}` })
            .where('id = :id', { id })
            .execute();
    }
    async refreshBaiduAccesstoken() {
        const allKeys = await this.modelsEntity.find({ where: { keyType: 2 } });
        const keysMap = {};
        allKeys.forEach(keyInfo => {
            const { key, secret } = keyInfo;
            if (!keysMap.key) {
                keysMap[key] = [{ keyInfo }];
            }
            else {
                keysMap[key].push(keyInfo);
            }
        });
        Object.keys(keysMap).forEach(async (key) => {
            const { secret, id } = keysMap[key][0]['keyInfo'];
            const accessToken = await (0, baidu_1.getAccessToken)(key, secret);
            await this.modelsEntity.update({ key }, { accessToken });
        });
        setTimeout(() => {
            this.initCalcKey();
        }, 1000);
    }
    async getRandomDrawKey() {
        const drawkeys = await this.modelsEntity.find({ where: { isDraw: true, status: true } });
        if (!drawkeys.length) {
            throw new common_1.HttpException('当前未指定特殊模型KEY、前往后台模型池设置吧！', common_1.HttpStatus.BAD_REQUEST);
        }
        return (0, utils_1.getRandomItemFromArray)(drawkeys);
    }
    async getAllKey() {
        return await this.modelsEntity.find();
    }
    async queryModelType(params) {
        return 1;
    }
    async setModelType(params) {
        return 1;
    }
    async delModelType(params) {
        return 1;
    }
};
ModelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(models_entity_1.ModelsEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(modelType_entity_1.ModelsTypeEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], ModelsService);
exports.ModelsService = ModelsService;
