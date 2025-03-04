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
exports.BadWordsController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const badWords_service_1 = require("./badWords.service");
const addBadWords_dto_1 = require("./dto/addBadWords.dto");
const delBadWords_dto_1 = require("./dto/delBadWords.dto");
const queryBadWords_dto_1 = require("./dto/queryBadWords.dto");
const queryViolation_dto_1 = require("./dto/queryViolation.dto");
const updateBadWords_dto_1 = require("./dto/updateBadWords.dto");
let BadWordsController = class BadWordsController {
    constructor(badWordsService) {
        this.badWordsService = badWordsService;
    }
    queryBadWords(query) {
        return this.badWordsService.queryBadWords(query);
    }
    delBadWords(body) {
        return this.badWordsService.delBadWords(body);
    }
    updateBadWords(body) {
        return this.badWordsService.updateBadWords(body);
    }
    addBadWord(body) {
        return this.badWordsService.addBadWord(body);
    }
    violation(req, query) {
        return this.badWordsService.violation(req, query);
    }
};
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有敏感词' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryBadWords_dto_1.QueryBadWordsDto]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "queryBadWords", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除敏感词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delBadWords_dto_1.DelBadWordsDto]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "delBadWords", null);
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '更新敏感词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateBadWords_dto_1.UpdateBadWordsDto]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "updateBadWords", null);
__decorate([
    (0, common_1.Post)('add'),
    (0, swagger_1.ApiOperation)({ summary: '新增敏感词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [addBadWords_dto_1.AddBadWordDto]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "addBadWord", null);
__decorate([
    (0, common_1.Get)('violation'),
    (0, swagger_1.ApiOperation)({ summary: '查询违规记录' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, queryViolation_dto_1.QueryViolationDto]),
    __metadata("design:returntype", void 0)
], BadWordsController.prototype, "violation", null);
BadWordsController = __decorate([
    (0, swagger_1.ApiTags)('badWords'),
    (0, common_1.Controller)('badWords'),
    __metadata("design:paramtypes", [badWords_service_1.BadWordsService])
], BadWordsController);
exports.BadWordsController = BadWordsController;
