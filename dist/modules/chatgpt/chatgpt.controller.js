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
exports.ChatgptController = void 0;
const jwtAuth_guard_1 = require("./../../common/auth/jwtAuth.guard");
const swagger_1 = require("@nestjs/swagger");
const chatgpt_service_1 = require("./chatgpt.service");
const common_1 = require("@nestjs/common");
const chatProcess_dto_1 = require("./dto/chatProcess.dto");
const chatDraw_dto_1 = require("./dto/chatDraw.dto");
const adminAuth_guard_1 = require("../../common/auth/adminAuth.guard");
const superAuth_guard_1 = require("../../common/auth/superAuth.guard");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
let ChatgptController = class ChatgptController {
    constructor(chatgptService, globalConfigService) {
        this.chatgptService = chatgptService;
        this.globalConfigService = globalConfigService;
    }
    chatProcess(body, req, res) {
        return this.chatgptService.chatProcess(body, req, res);
    }
    chatProcessSync(body, req) {
        return this.chatgptService.chatProcess(Object.assign({}, body), req);
    }
    async mjAssociate(body, req) {
        const mjCustomLianxiangPrompt = await this.globalConfigService.getConfigs(['mjCustomLianxiangPrompt']);
        body.systemMessage =
            mjCustomLianxiangPrompt ||
                `midjourney是一款AI绘画工具，只要你输入你想到的文字，就能通过人工智能产出相对应的图片、我希望你作为MidJourney程序的提示词(prompt)生成器。你的工作是根据我给你的一段提示内容扩展为更详细和更有创意的描述，以激发人工智能的独特和有趣的图像。请记住，人工智能能够理解广泛的语言，并能解释抽象的概念，所以请自由发挥想象力和描述力，尽可能地发挥。例如，你可以描述一个未来城市的场景，或一个充满奇怪生物的超现实景观。你的描述越详细、越有想象力，产生的图像就越有趣、Midjourney prompt的标准公式为:(image we're prompting).(5 descriptivekeywords). (camera type). (camera lens type). (time of day)(style of photograph).(type offilm)、请记住这个公式，后续统一使用该公式进行prompt生成、最终把我给你的提示变成一整段连续不分开的完整内容，并且只需要用英文回复您的联想、一定不要回复别内容、包括解释、我只需要纯粹的内容。`;
        return this.chatgptService.chatProcess(Object.assign(Object.assign({}, body), { cusromPrompt: true }), req);
    }
    async mjFanyi(body, req) {
        const mjCustomFanyiPrompt = await this.globalConfigService.getConfigs(['mjCustomFanyiPrompt']);
        body.systemMessage =
            mjCustomFanyiPrompt ||
                `接下来我会给你一些内容、我希望你帮我翻译成英文、不管我给你任何语言、你都回复我英文、如果给你了英文、依然回复我更加优化的英文、并且期望你不需要做任何多余的解释、给我英文即可、不要加任何东西、我只需要英文！`;
        return this.chatgptService.chatProcess(Object.assign(Object.assign({}, body), { cusromPrompt: true }), req);
    }
    async chatmind(body, req, res) {
        const mindCustomPrompt = await this.globalConfigService.getConfigs(['mindCustomPrompt']);
        body.systemMessage =
            mindCustomPrompt ||
                `我希望你使用markdown格式回答我得问题、我的需求是得到一份markdown格式的大纲、尽量做的精细、层级多一点、不管我问你什么、都需要您回复我一个大纲出来、我想使用大纲做思维导图、除了大纲之外、不要无关内容和总结。`;
        return this.chatgptService.chatProcess(Object.assign(Object.assign({}, body), { cusromPrompt: true }), req, res);
    }
    async draw(body, req) {
        return await this.chatgptService.draw(body, req);
    }
    async setChatBoxType(req, body) {
        return await this.chatgptService.setChatBoxType(req, body);
    }
    async delChatBoxType(req, body) {
        return await this.chatgptService.delChatBoxType(req, body);
    }
    async queryChatBoxType() {
        return await this.chatgptService.queryChatBoxType();
    }
    async setChatBox(req, body) {
        return await this.chatgptService.setChatBox(req, body);
    }
    async delChatBox(req, body) {
        return await this.chatgptService.delChatBox(req, body);
    }
    async queryChatBox() {
        return await this.chatgptService.queryChatBox();
    }
    async queryChatBoxFrontend() {
        return await this.chatgptService.queryChatBoxFrontend();
    }
    async setChatPreType(req, body) {
        return await this.chatgptService.setChatPreType(req, body);
    }
    async delChatPreType(req, body) {
        return await this.chatgptService.delChatPreType(req, body);
    }
    async queryChatPreType() {
        return await this.chatgptService.queryChatPreType();
    }
    async setChatPre(req, body) {
        return await this.chatgptService.setChatPre(req, body);
    }
    async delChatPre(req, body) {
        return await this.chatgptService.delChatPre(req, body);
    }
    async queryChatPre() {
        return await this.chatgptService.queryChatPre();
    }
    async queryChatPreList() {
        return await this.chatgptService.queryChatPreList();
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
], ChatgptController.prototype, "chatProcess", null);
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
], ChatgptController.prototype, "chatProcessSync", null);
__decorate([
    (0, common_1.Post)('mj-associate'),
    (0, swagger_1.ApiOperation)({ summary: 'gpt描述词绘画联想' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatProcess_dto_1.ChatProcessDto, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "mjAssociate", null);
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
], ChatgptController.prototype, "mjFanyi", null);
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
], ChatgptController.prototype, "chatmind", null);
__decorate([
    (0, common_1.Post)('chat-draw'),
    (0, swagger_1.ApiOperation)({ summary: 'gpt绘画' }),
    (0, common_1.UseGuards)(jwtAuth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chatDraw_dto_1.ChatDrawDto, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "draw", null);
__decorate([
    (0, common_1.Post)('setChatBoxType'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改分类类型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "setChatBoxType", null);
__decorate([
    (0, common_1.Post)('delChatBoxType'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改ChatBoxType' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "delChatBoxType", null);
__decorate([
    (0, common_1.Get)('queryChatBoxTypes'),
    (0, swagger_1.ApiOperation)({ summary: '查询ChatBoxType' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "queryChatBoxType", null);
__decorate([
    (0, common_1.Post)('setChatBox'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改ChatBox' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "setChatBox", null);
__decorate([
    (0, common_1.Post)('delChatBox'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改ChatBox提示词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "delChatBox", null);
__decorate([
    (0, common_1.Get)('queryChatBoxs'),
    (0, swagger_1.ApiOperation)({ summary: '查询ChatBox列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "queryChatBox", null);
__decorate([
    (0, common_1.Get)('queryChatBoxFrontend'),
    (0, swagger_1.ApiOperation)({ summary: '查询ChatBox分类加详细' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "queryChatBoxFrontend", null);
__decorate([
    (0, common_1.Post)('setChatPreType'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改预设分类类型' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "setChatPreType", null);
__decorate([
    (0, common_1.Post)('delChatPretype'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改ChatPretype' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "delChatPreType", null);
__decorate([
    (0, common_1.Get)('queryChatPretypes'),
    (0, swagger_1.ApiOperation)({ summary: '查询ChatPretype' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "queryChatPreType", null);
__decorate([
    (0, common_1.Post)('setChatPre'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改ChatPre' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "setChatPre", null);
__decorate([
    (0, common_1.Post)('delChatPre'),
    (0, swagger_1.ApiOperation)({ summary: '添加修改ChatPre提示词' }),
    (0, common_1.UseGuards)(superAuth_guard_1.SuperAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "delChatPre", null);
__decorate([
    (0, common_1.Get)('queryChatPres'),
    (0, swagger_1.ApiOperation)({ summary: '查询ChatPre列表' }),
    (0, common_1.UseGuards)(adminAuth_guard_1.AdminAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "queryChatPre", null);
__decorate([
    (0, common_1.Get)('queryChatPreList'),
    (0, swagger_1.ApiOperation)({ summary: '查询ChatPre列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatgptController.prototype, "queryChatPreList", null);
ChatgptController = __decorate([
    (0, swagger_1.ApiTags)('chatgpt'),
    (0, common_1.Controller)('chatgpt'),
    __metadata("design:paramtypes", [chatgpt_service_1.ChatgptService, globalConfig_service_1.GlobalConfigService])
], ChatgptController);
exports.ChatgptController = ChatgptController;
