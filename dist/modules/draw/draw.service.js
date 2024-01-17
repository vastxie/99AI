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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const uuid = require("uuid");
const upload_service_1 = require("../upload/upload.service");
let DrawService = class DrawService {
    constructor(uploadService) {
        this.uploadService = uploadService;
    }
    async onModuleInit() {
        var _a;
        this.apiHost = (_a = process.env.API_HOST) !== null && _a !== void 0 ? _a : 'https://api.stability.ai';
        this.apiKey = process.env.STABILITY_API_KEY;
        if (!this.apiKey) {
            this.apiKey = '*********';
        }
        this.Authorization = `Bearer ${this.apiKey}`;
    }
    async getEngines() {
        var _a, _b;
        const url = `${this.apiHost}/v1/engines/list`;
        const res = await (0, axios_1.default)(url, {
            method: 'GET',
            headers: { Authorization: this.Authorization },
        });
        if (res.status === 401) {
            console.log(`stability api key is invalid, ${(_a = res === null || res === void 0 ? void 0 : res.data) === null || _a === void 0 ? void 0 : _a.message}`);
        }
        if (res.status !== 200) {
            console.log(`${res.status} ${(_b = res === null || res === void 0 ? void 0 : res.data) === null || _b === void 0 ? void 0 : _b.message}}`);
            throw new common_1.HttpException('获取列表失败', common_1.HttpStatus.BAD_REQUEST);
        }
        return res.data;
    }
    async drawTextToImage(body) {
        const { engineId = 'stable-diffusion-768-v2-1' } = body;
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: this.Authorization,
        };
        const url = `${this.apiHost}/v1/generation/${engineId}/text-to-image`;
        try {
            const response = await axios_1.default.post(url, body, { headers });
            if (response.status !== 200) {
                throw new common_1.HttpException('绘制失败', common_1.HttpStatus.BAD_REQUEST);
            }
            const resImageBasetask = [];
            for (const item of response.data.artifacts) {
                const filename = uuid.v4().slice(0, 10) + '.png';
                const buffer = Buffer.from(item.base64, 'base64');
                resImageBasetask.push(this.uploadService.uploadFile({ filename, buffer }));
            }
            const urls = await Promise.all(resImageBasetask);
            return urls;
        }
        catch (error) {
            if (!(error === null || error === void 0 ? void 0 : error.response)) {
                throw new common_1.HttpException('绘制失败', common_1.HttpStatus.BAD_REQUEST);
            }
            const { status, data } = error.response;
            throw new common_1.HttpException(data.message, status);
        }
    }
};
DrawService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService])
], DrawService);
exports.DrawService = DrawService;
