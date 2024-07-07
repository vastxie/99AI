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
var AzureTtsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureTtsService = void 0;
const common_1 = require("@nestjs/common");
const chatLog_service_1 = require("../chatLog/chatLog.service");
const globalConfig_service_1 = require("../globalConfig/globalConfig.service");
const upload_service_1 = require("../upload/upload.service");
let AzureTtsService = AzureTtsService_1 = class AzureTtsService {
    constructor(uploadService, globalConfigService, chatLogService) {
        this.uploadService = uploadService;
        this.globalConfigService = globalConfigService;
        this.chatLogService = chatLogService;
        this.logger = new common_1.Logger(AzureTtsService_1.name);
    }
};
AzureTtsService = AzureTtsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService,
        globalConfig_service_1.GlobalConfigService,
        chatLog_service_1.ChatLogService])
], AzureTtsService);
exports.AzureTtsService = AzureTtsService;
