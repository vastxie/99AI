import { Global, Module } from '@nestjs/common';
import { ChatLiveSyncService } from './chat-live-sync.service';

/**
 * 轻量实时同步基础设施独立于 ChatModule，供 Chat 与 ChatGroup 共同使用，
 * 避免 ChatModule -> ChatGroupModule -> ChatModule 的循环依赖。
 */
@Global()
@Module({
  providers: [ChatLiveSyncService],
  exports: [ChatLiveSyncService],
})
export class ChatLiveSyncModule {}
