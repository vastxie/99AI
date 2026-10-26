import { Global, Module } from '@nestjs/common';
import { FileAssetModule } from '../fileAsset/fileAsset.module';
import { OpenAIChatCompletionsAdapter } from './adapters/openai-chat-completions.adapter';
import { ModelGatewayMediaPreparerService } from './model-gateway-media-preparer.service';
import { ModelGatewayService } from './model-gateway.service';
import { ModelGatewayUrlBuilder } from './model-gateway-url.builder';
import { ModelStreamRegistry } from './model-stream';

/**
 * 模型网关内核：协议注册表 + 通用流式 / 一次性调用 + URL 构造 + 媒体准备。
 * 内核只自带 OpenAI Chat Completions 基线协议；Responses / Anthropic / Gemini 等由各模型包的适配器
 * 在构造时向 ModelStreamRegistry 注册（连同厂商预设与模型目录）。
 */
@Global()
@Module({
  imports: [FileAssetModule],
  providers: [
    ModelStreamRegistry,
    ModelGatewayUrlBuilder,
    ModelGatewayMediaPreparerService,
    OpenAIChatCompletionsAdapter,
    ModelGatewayService,
  ],
  exports: [ModelStreamRegistry, ModelGatewayUrlBuilder, ModelGatewayService],
})
export class ModelGatewayModule {}
