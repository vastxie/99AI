import { Module } from '@nestjs/common';
import { OpenCodeGoChatCompletionsAdapter } from './opencode-go-chat-completions.adapter';

/** OpenCode Go 专属模型协议包；由 MODEL_OPENCODE_GO_PACK_ENABLED 决定是否装载。 */
@Module({
  providers: [OpenCodeGoChatCompletionsAdapter],
})
export class ModelOpenCodeGoPackModule {}
