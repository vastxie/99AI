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
exports.ChatGroupController = void 0;
const swagger_1 = require("@nestjs/swagger");
const chatGroup_service_1 = require("./chatGroup.service");
const common_1 = require("@nestjs/common");
const createGroup_dto_1 = require("./dto/createGroup.dto");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const delGroup_dto_1 = require("./dto/delGroup.dto");
const updateGroup_dto_1 = require("./dto/updateGroup.dto");
let ChatGroupController = class ChatGroupController {
    constructor(chatGroupService) {
        this.chatGroupService = chatGroupService;
    }
    create(body, req) {
        return this.chatGroupService.create(body, req);
    }
    query(req) {
        return this.chatGroupService.query(req);
    }
    update(body, req) {
        return this.chatGroupService.update(body, req);
    }
    del(body, req) {
        return this.chatGroupService.del(body, req);
    }
    delAll(req) {
        return this.chatGroupService.delAll(req);
    }
};
__decorate([
    (0, common_1.Post)('create'),
    (0, swagger_1.ApiOperation)({ summary: '创建对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [createGroup_dto_1.CreateGroupDto, Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '查询对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "query", null);
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '更新对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateGroup_dto_1.UpdateGroupDto, Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delGroup_dto_1.DelGroupDto, Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "del", null);
__decorate([
    (0, common_1.Post)('delAll'),
    (0, swagger_1.ApiOperation)({ summary: '删除对话组' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChatGroupController.prototype, "delAll", null);
ChatGroupController = __decorate([
    (0, swagger_1.ApiTags)('group'),
    (0, common_1.Controller)('group'),
    __metadata("design:paramtypes", [chatGroup_service_1.ChatGroupService])
], ChatGroupController);
exports.ChatGroupController = ChatGroupController;
