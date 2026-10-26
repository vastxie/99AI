import { Module } from '@nestjs/common';
import { AnthropicMessagesAdapter } from './anthropic-messages.adapter';

/**
 * 模型协议包：Anthropic Claude Messages 协议。
 * 适配器在构造时向内核 ModelStreamRegistry 注册（连同厂商预设与模型目录）；由 MODEL_ANTHROPIC_PACK_ENABLED 决定是否装载。
 */
@Module({
  providers: [AnthropicMessagesAdapter],
})
export class ModelAnthropicPackModule {}
