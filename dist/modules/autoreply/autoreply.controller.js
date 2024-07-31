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
exports.AutoreplyController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const autoreply_service_1 = require("./autoreply.service");
const addAutoReply_dto_1 = require("./dto/addAutoReply.dto");
const delBadWords_dto_1 = require("./dto/delBadWords.dto");
const queryAutoReply_dto_1 = require("./dto/queryAutoReply.dto");
const updateAutoReply_dto_1 = require("./dto/updateAutoReply.dto");
let AutoreplyController = class AutoreplyController {
    constructor(autoreplyService) {
        this.autoreplyService = autoreplyService;
    }
    queryAutoreply(query) {
        return this.autoreplyService.queryAutoreply(query);
    }
    addAutoreply(body) {
        return this.autoreplyService.addAutoreply(body);
    }
    updateAutoreply(body) {
        return this.autoreplyService.updateAutoreply(body);
    }
    delAutoreply(body) {
        return this.autoreplyService.delAutoreply(body);
    }
};
__decorate([
    (0, common_1.Get)('query'),
    (0, swagger_1.ApiOperation)({ summary: '查询自动回复' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAutoReply_dto_1.QueryAutoReplyDto]),
    __metadata("design:returntype", void 0)
], AutoreplyController.prototype, "queryAutoreply", null);
__decorate([
    (0, common_1.Post)('add'),
    (0, swagger_1.ApiOperation)({ summary: '添加自动回复' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [addAutoReply_dto_1.AddAutoReplyDto]),
    __metadata("design:returntype", void 0)
], AutoreplyController.prototype, "addAutoreply", null);
__decorate([
    (0, common_1.Post)('update'),
    (0, swagger_1.ApiOperation)({ summary: '修改自动回复' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [updateAutoReply_dto_1.UpdateAutoReplyDto]),
    __metadata("design:returntype", void 0)
], AutoreplyController.prototype, "updateAutoreply", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除自动回复' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delBadWords_dto_1.DelAutoReplyDto]),
    __metadata("design:returntype", void 0)
], AutoreplyController.prototype, "delAutoreply", null);
AutoreplyController = __decorate([
    (0, swagger_1.ApiTags)('autoreply'),
    (0, common_1.Controller)('autoreply'),
    __metadata("design:paramtypes", [autoreply_service_1.AutoreplyService])
], AutoreplyController);
exports.AutoreplyController = AutoreplyController;
