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
exports.AutoreplyService = void 0;
const common_1 = require("@nestjs/common");
const autoreplay_entity_1 = require("./autoreplay.entity");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("@nestjs/typeorm");
let AutoreplyService = class AutoreplyService {
    constructor(autoReplyEntity) {
        this.autoReplyEntity = autoReplyEntity;
        this.autoReplyKes = [];
        this.autoReplyMap = {};
        this.autoReplyFuzzyMatch = true;
    }
    async onModuleInit() {
        this.loadAutoReplyList();
    }
    async loadAutoReplyList() {
        const res = await this.autoReplyEntity.find({ where: { status: 1 }, select: ['prompt', 'answer'] });
        this.autoReplyMap = {};
        res.forEach((t) => (this.autoReplyMap[t.prompt] = t.answer));
        this.autoReplyKes = Object.keys(this.autoReplyMap);
    }
    async checkAutoReply(prompt) {
        let question = prompt;
        if (this.autoReplyFuzzyMatch) {
            question = this.autoReplyKes.find((item) => item.includes(prompt));
        }
        return question ? this.autoReplyMap[question] : '';
    }
    async queryAutoreply(query) {
        const { page = 1, size = 10, prompt, status } = query;
        const where = {};
        [0, 1, '0', '1'].includes(status) && (where.status = status);
        prompt && (where.prompt = (0, typeorm_1.Like)(`%${prompt}%`));
        const [rows, count] = await this.autoReplyEntity.findAndCount({
            where,
            skip: (page - 1) * size,
            take: size,
            order: { id: 'DESC' },
        });
        return { rows, count };
    }
    async addAutoreply(body) {
        const { prompt } = body;
        const a = await this.autoReplyEntity.findOne({ where: { prompt } });
        if (a) {
            throw new common_1.HttpException('该问题已存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.autoReplyEntity.save(body);
        await this.loadAutoReplyList();
        return '添加问题成功！';
    }
    async updateAutoreply(body) {
        const { id } = body;
        const res = await this.autoReplyEntity.update({ id }, body);
        if (res.affected > 0) {
            await this.loadAutoReplyList();
            return '更新问题成功';
        }
        throw new common_1.HttpException('更新失败', common_1.HttpStatus.BAD_REQUEST);
    }
    async delAutoreply(body) {
        const { id } = body;
        const z = await this.autoReplyEntity.findOne({ where: { id } });
        if (!z) {
            throw new common_1.HttpException('该问题不存在,请检查您的提交信息', common_1.HttpStatus.BAD_REQUEST);
        }
        const res = await this.autoReplyEntity.delete({ id });
        if (res.affected > 0) {
            await this.loadAutoReplyList();
            return '删除问题成功';
        }
        throw new common_1.HttpException('删除失败', common_1.HttpStatus.BAD_REQUEST);
    }
};
AutoreplyService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_2.InjectRepository)(autoreplay_entity_1.AutoReplyEntity)),
    __metadata("design:paramtypes", [typeorm_1.Repository])
], AutoreplyService);
exports.AutoreplyService = AutoreplyService;
