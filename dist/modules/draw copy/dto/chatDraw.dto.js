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
exports.StableDrawDto = exports.TextPromptDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class TextPromptDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TextPromptDto.prototype, "text", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TextPromptDto.prototype, "weight", void 0);
exports.TextPromptDto = TextPromptDto;
class StableDrawDto {
    constructor() {
        this.samples = 1;
        this.width = 512;
        this.height = 512;
        this.cfg_scale = 7;
        this.steps = 30;
        this.clip_guidance_preset = 'NONE';
    }
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'stable-diffusion-512-v2-1', default: 512, description: '模型id', required: true }),
    (0, class_validator_1.IsDefined)({ message: '模型id是必传参数' }),
    __metadata("design:type", String)
], StableDrawDto.prototype, "engineId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: [
            {
                text: 'Draw a cute little dog',
                weight: 0.5,
            },
        ],
        description: '绘画描述信息',
    }),
    (0, class_transformer_1.Type)(() => TextPromptDto),
    (0, class_validator_1.ValidateNested)({ each: true }),
    __metadata("design:type", Array)
], StableDrawDto.prototype, "text_prompts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '绘画张数', required: true }),
    __metadata("design:type", Object)
], StableDrawDto.prototype, "samples", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 512, default: 512, description: '图片尺寸宽度' }),
    (0, class_validator_1.Max)(1024, { message: '图片尺寸最大宽度1024' }),
    (0, class_validator_1.Min)(512, { message: '图片尺寸最小宽度512' }),
    __metadata("design:type", Object)
], StableDrawDto.prototype, "width", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 512, default: 512, description: '图片尺寸高度' }),
    (0, class_validator_1.Max)(1024, { message: '图片高度尺寸最大宽度1024' }),
    (0, class_validator_1.Min)(512, { message: '图片高度尺寸最小宽度512' }),
    __metadata("design:type", Object)
], StableDrawDto.prototype, "height", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 15, default: 7, description: '图片绘制扩散思维[值越高，图像越接近提示]', required: true }),
    (0, class_validator_1.Max)(35, { message: '扩散思维值最大为35' }),
    (0, class_validator_1.Min)(0, { message: '扩散思维值最小为0' }),
    __metadata("design:type", Object)
], StableDrawDto.prototype, "cfg_scale", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50, description: '绘制步骤', required: true }),
    (0, class_validator_1.Max)(150, { message: '最大步骤不大于150' }),
    (0, class_validator_1.Min)(10, { message: '步骤不小于10' }),
    __metadata("design:type", Object)
], StableDrawDto.prototype, "steps", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'anime', description: '样式预设', required: true }),
    (0, class_validator_1.IsIn)([
        '3d-model',
        'analog-film',
        'anime',
        'cinematic',
        'comic-book',
        'digital-art',
        'enhance',
        'fantasy-art',
        'isometric',
        'line-art',
        'low-poly',
        'modeling-compound',
        'neon-punk',
        'origami',
        'photographic',
        'pixel-art',
        'tile-texture',
    ]),
    __metadata("design:type", String)
], StableDrawDto.prototype, "style_preset", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'NONE', description: '裁剪指南预设', required: true }),
    (0, class_validator_1.IsIn)(['NONE', 'FAST_BLUE', 'FAST_GREEN', 'SIMPLE', 'SLOW', 'SLOWER', 'SLOWEST']),
    __metadata("design:type", Object)
], StableDrawDto.prototype, "clip_guidance_preset", void 0);
exports.StableDrawDto = StableDrawDto;
