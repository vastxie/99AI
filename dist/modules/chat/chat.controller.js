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
exports.ChatController = void 0;
const swagger_1 = require("@nestjs/swagger");
const jwtAuth_guard_1 = require("../../common/auth/jwtAuth.guard");
const chat_service_1 = require("./chat.service");
const common_1 = require("@nestjs/common");
const chatProcess_dto_1 = require("./dto/chatProcess.dto");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let ChatController = class ChatController {
    constructor(chatService, globalConfigService) {
        this.chatService = chatService;
        this.globalConfigService = globalConfigService;
    }
    chatProcess(body, req, res) {
        return this.chatService.chatProcess(body, req, res);
    }
    chatProcessSync(body, req) {
        return this.chatService.chatProcess(Object.assign({}, body), req);
    }
    async mjFanyi(body, req) {
        return this.chatService.chatProcess(Object.assign(Object.assign({}, body), { specialModel: 'PromptOptimization' }), req);
    }
    async chatmind(body, req, res) {
        return this.chatService.chatProcess(Object.assign(Object.assign({}, body), { specialModel: 'MindMap' }), req, res);
    }
    ttsProcess(body, req, res) {
        return this.chatService.ttsProcess(body, req, res);
    }
};
__decorate([
    (0, common_1.Post)('chat-process'),
    (0, swagger_1.ApiOperation)({ summary: 'gpt聊天对话' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatProcess_dto_1.ChatProcessDto, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "chatProcess", null);
__decorate([
    (0, common_1.Post)('chat-sync'),
    (0, swagger_1.ApiOperation)({ summary: 'gpt聊天对话' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatProcess_dto_1.ChatProcessDto, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "chatProcessSync", null);
__decorate([
    (0, common_1.Post)('mj-fy'),
    (0, swagger_1.ApiOperation)({ summary: 'gpt描述词绘画翻译' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatProcess_dto_1.ChatProcessDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "mjFanyi", null);
__decorate([
    (0, common_1.Post)('chat-mind'),
    (0, swagger_1.ApiOperation)({ summary: 'mind思维导图提示' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatProcess_dto_1.ChatProcessDto, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "chatmind", null);
__decorate([
    (0, common_1.Post)('tts-process'),
    (0, swagger_1.ApiOperation)({ summary: 'tts语音播报' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "ttsProcess", null);
ChatController = __decorate([
    (0, swagger_1.ApiTags)('chatgpt'),
    (0, common_1.Controller)('chatgpt'),
    __metadata("design:paramtypes", [chat_service_1.ChatService,
        globalConfig_service_1.GlobalConfigService])
], ChatController);
exports.ChatController = ChatController;
