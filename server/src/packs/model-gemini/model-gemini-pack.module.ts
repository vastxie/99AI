import { Module } from '@nestjs/common';
import { GeminiGenerateContentAdapter } from './gemini-generate-content.adapter';

/**
 * 模型协议包：Google Gemini Generate Content 协议。
 * 适配器在构造时向内核 ModelStreamRegistry 注册（连同厂商预设与模型目录）；由 MODEL_GEMINI_PACK_ENABLED 决定是否装载。
 */
@Module({
  providers: [GeminiGenerateContentAdapter],
})
export class ModelGeminiPackModule {}
