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
exports.ChatLogController = void 0;
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const chatLog_service_1 = require("./chatLog.service");
const chatList_dto_1 = require("./dto/chatList.dto");
const del_dto_1 = require("./dto/del.dto");
const delByGroup_dto_1 = require("./dto/delByGroup.dto");
const exportExcelChatlog_dto_1 = require("./dto/exportExcelChatlog.dto");
const queryAllChatLog_dto_1 = require("./dto/queryAllChatLog.dto");
const queryAllDrawLog_dto_1 = require("./dto/queryAllDrawLog.dto");
const queryByAppId_dto_1 = require("./dto/queryByAppId.dto");
const queryMyChatLog_dto_1 = require("./dto/queryMyChatLog.dto");
const recDrawImg_dto_1 = require("./dto/recDrawImg.dto");
let ChatLogController = class ChatLogController {
    constructor(chatLogService) {
        this.chatLogService = chatLogService;
    }
    querDrawLog(query, req) {
        return this.chatLogService.querDrawLog(req, query);
    }
    recDrawImg(body) {
        return this.chatLogService.recDrawImg(body);
    }
    querAllDrawLog(params) {
        return this.chatLogService.querAllDrawLog(params);
    }
    queryAllChatLog(params, req) {
        return this.chatLogService.querAllChatLog(params, req);
    }
    exportExcel(body, res) {
        return this.chatLogService.exportExcel(body, res);
    }
    chatList(req, params) {
        return this.chatLogService.chatList(req, params);
    }
    del(req, body) {
        return this.chatLogService.deleteChatLog(req, body);
    }
    delByGroupId(req, body) {
        return this.chatLogService.delByGroupId(req, body);
    }
    deleteChatsAfterId(req, body) {
        return this.chatLogService.deleteChatsAfterId(req, body);
    }
    byAppId(req, params) {
        return this.chatLogService.byAppId(req, params);
    }
};
__decorate([
    (0, common_1.Get)('draw'),
    (0, swagger_1.ApiOperation)({ summary: '查询我的绘制记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryMyChatLog_dto_1.QuerMyChatLogDto, Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "querDrawLog", null);
__decorate([
    (0, common_1.Post)('recDrawImg'),
    (0, swagger_1.ApiOperation)({ summary: '推荐此图片对外展示' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [recDrawImg_dto_1.recDrawImgDto]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "recDrawImg", null);
__decorate([
    (0, common_1.Get)('drawAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有的绘制记录' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAllDrawLog_dto_1.QuerAllDrawLogDto]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "querAllDrawLog", null);
__decorate([
    (0, common_1.Get)('chatAll'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [queryAllChatLog_dto_1.QuerAllChatLogDto, Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "queryAllChatLog", null);
__decorate([
    (0, common_1.Post)('exportExcel'),
    (0, swagger_1.ApiOperation)({ summary: '导出问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exportExcelChatlog_dto_1.ExportExcelChatlogDto, Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "exportExcel", null);
__decorate([
    (0, common_1.Get)('chatList'),
    (0, swagger_1.ApiOperation)({ summary: '查询我的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, chatList_dto_1.ChatListDto]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "chatList", null);
__decorate([
    (0, common_1.Post)('del'),
    (0, swagger_1.ApiOperation)({ summary: '删除我的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, del_dto_1.DelDto]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "del", null);
__decorate([
    (0, common_1.Post)('delByGroupId'),
    (0, swagger_1.ApiOperation)({ summary: '清空一组对话' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, delByGroup_dto_1.DelByGroupDto]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "delByGroupId", null);
__decorate([
    (0, common_1.Post)('deleteChatsAfterId'),
    (0, swagger_1.ApiOperation)({ summary: '删除对话组中某条对话及其后的所有对话' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "deleteChatsAfterId", null);
__decorate([
    (0, common_1.Get)('byAppId'),
    (0, swagger_1.ApiOperation)({ summary: '查询某个应用的问答记录' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, queryByAppId_dto_1.QueryByAppIdDto]),
    __metadata("design:returntype", void 0)
], ChatLogController.prototype, "byAppId", null);
ChatLogController = __decorate([
    (0, common_1.Controller)('chatLog'),
    (0, swagger_1.ApiTags)('ChatLog'),
    __metadata("design:paramtypes", [chatLog_service_1.ChatLogService])
], ChatLogController);
exports.ChatLogController = ChatLogController;
