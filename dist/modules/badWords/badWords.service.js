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
exports.BadWordsService = void 0;
const utils_1 = require("../../common/utils");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const axios_1 = require("axios");
const typeorm_2 = require("typeorm");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const user_entity_1 = require("../user/user.entity");
const badWords_entity_1 = require("./badWords.entity");
const violationLog_entity_1 = require("./violationLog.entity");
let BadWordsService = class BadWordsService {
    constructor(badWordsEntity, violationLogEntity, userEntity, globalConfigService) {
        this.badWordsEntity = badWordsEntity;
        this.violationLogEntity = violationLogEntity;
        this.userEntity = userEntity;
        this.globalConfigService = globalConfigService;
        this.badWords = [];
    }
    async onModuleInit() {
        this.loadBadWords();
    }
    async customSensitiveWords(content, userId) {
        const triggeredWords = [];
        for (let i = 0; i < this.badWords.length; i++) {
            const word = this.badWords[i];
            if (content.includes(word)) {
                triggeredWords.push(word);
            }
        }
        if (triggeredWords.length) {
            await this.recordUserBadWords(userId, content, triggeredWords, ['自定义'], '自定义检测');
        }
        return triggeredWords;
    }
    async checkBadWords(content, userId) {
        const config = await this.globalConfigService.getSensitiveConfig();
        if (config) {
            await this.checkBadWordsByConfig(content, config, userId);
        }
        return await this.customSensitiveWords(content, userId);
    }
    async checkBadWordsByConfig(content, config, userId) {
        const { useType } = config;
        useType === 'baidu' &&
            (await this.baiduCheckBadWords(content, config.baiduTextAccessToken, userId));
    }
    extractContent(str) {
        const pattern = /存在(.*?)不合规/;
        const match = str.match(pattern);
        return match ? match[1] : '';
    }
    async baiduCheckBadWords(content, accessToken, userId) {
        if (!accessToken)
            return;
        const url = `https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${accessToken}}`;
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        };
        const response = await axios_1.default.post(url, { text: content }, { headers });
        const { conclusion, error_code, error_msg, conclusionType, data } = response.data;
        if (error_code) {
            console.log('百度文本检测出现错误、请查看配置信息: ', error_msg);
        }
        if (conclusionType !== 1) {
            const types = [
                ...new Set(data.map((item) => this.extractContent(item.msg))),
            ];
            await this.recordUserBadWords(userId, content, ['***'], types, '百度云检测');
            const tips = `您提交的信息中包含${types.join(',')}的内容、我们已对您的账户进行标记、请合规使用！`;
            throw new common_1.HttpException(tips, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    formarTips(wordList) {
        const categorys = wordList.map((t) => t.category);
        const unSet = [...new Set(categorys)];
        return `您提交的内容中包含${unSet.join(',')}的信息、我们已对您账号进行标记、请合规使用！`;
    }
    async loadBadWords() {
        const data = await this.badWordsEntity.find({
            where: { status: 1 },
            select: ['word'],
        });
        this.badWords = data.map((t) => t.word);
    }
    async queryBadWords(query) {
        const { page = 1, size = 500, word, status } = query;
        const where = {};
        [0, 1, '0', '1'].includes(status) && (where.status = status);
        word && (where.word = (0, typeorm_2.Like)(`%${word}%`));
        const [rows, count] = await this.badWordsEntity.findAndCount({
            where,
            skip: (page - 1) * size,
            take: size,
            order: { id: 'ASC' },
        });
        return { rows, count };
    }
    async delBadWords(body) {
        const b = await this.badWordsEntity.findOne({ where: { id: body.id } });
        if (!b) {
            throw new common_1.HttpException('敏感词不存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.badWordsEntity.delete({ id: body.id });
        if (res.affected > 0) {
            await this.loadBadWords();
            return '删除敏感词成功';
        }
        else {
            throw new common_1.HttpException('删除敏感词失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async updateBadWords(body) {
        const { id, word, status } = body;
        const b = await this.badWordsEntity.findOne({ where: { word } });
        if (b) {
            throw new common_1.HttpException('敏感词已经存在了、请勿重复添加', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.badWordsEntity.update({ id }, { word, status });
        if (res.affected > 0) {
            await this.loadBadWords();
            return '更新敏感词成功';
        }
        else {
            throw new common_1.HttpException('更新敏感词失败', common_1.HttpStatus.BAD_REQUEST);
        }
    }
    async addBadWord(body) {
        const { word } = body;
        const b = await this.badWordsEntity.findOne({ where: { word } });
        if (b) {
            throw new common_1.HttpException('敏感词已存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.badWordsEntity.save({ word });
        await this.loadBadWords();
        return '添加敏感词成功';
    }
    async recordUserBadWords(userId, content, words, typeCn, typeOriginCn) {
        const data = {
            userId,
            content,
            words: JSON.stringify(words),
            typeCn: JSON.stringify(typeCn),
            typeOriginCn,
        };
        try {
            await this.userEntity
                .createQueryBuilder()
                .update(user_entity_1.UserEntity)
                .set({ violationCount: () => 'violationCount + 1' })
                .where('id = :userId', { userId })
                .execute();
            await this.violationLogEntity.save(data);
        }
        catch (error) {
            console.log('error: ', error);
        }
    }
    async violation(req, query) {
        const { role } = req.user;
        const { page = 1, size = 10, userId, typeOriginCn } = query;
        const where = {};
        userId && (where['userId'] = userId);
        typeOriginCn && (where['typeOriginCn'] = typeOriginCn);
        const [rows, count] = await this.violationLogEntity.findAndCount({
            where,
            skip: (page - 1) * size,
            take: size,
            order: { id: 'DESC' },
        });
        const userIds = [...new Set(rows.map((t) => t.userId))];
        const usersInfo = await this.userEntity.find({
            where: { id: (0, typeorm_2.In)(userIds) },
            select: ['id', 'avatar', 'username', 'email', 'violationCount', 'status'],
        });
        rows.forEach((t) => {
            const user = usersInfo.find((u) => u.id === t.userId) || {};
            role !== 'super' && (user.email = (0, utils_1.hideString)(user.email));
            t.userInfo = user;
        });
        return { rows, count };
    }
};
BadWordsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(badWords_entity_1.BadWordsEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(violationLog_entity_1.ViolationLogEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        globalConfig_service_1.GlobalConfigService])
], BadWordsService);
exports.BadWordsService = BadWordsService;
