import { Module } from '@nestjs/common';
import { OpenAIResponsesAdapter } from './openai-responses.adapter';

/**
 * 模型协议包：OpenAI Responses 协议（含豆包方舟 Responses 兼容、原生联网搜索）。
 * 适配器在构造时向内核 ModelStreamRegistry 注册（连同厂商预设与模型目录）；由 MODEL_OPENAI_RESPONSES_PACK_ENABLED 决定是否装载。
 */
@Module({
  providers: [OpenAIResponsesAdapter],
})
export class ModelOpenAIResponsesPackModule {}
