import { Global, Module } from '@nestjs/common';
import { ChatTitleService } from './chat-title.service';
import { ChatControlService } from './chat-control.service';
import { ChatUploadContextService } from './chat-upload-context.service';
import { ChatContextBuilderService } from './chat-context-builder.service';
import { ChatBillingService } from './chat-billing.service';
import { ChatPreflightService } from './chat-preflight.service';
import { ChatTurnPersistenceService } from './chat-turn-persistence.service';
import { ChatSubmissionService } from './chat-submission.service';
import { ChatInteractionRunner } from './chat-interaction.runner';
import { InteractionDispatcher } from './interaction-dispatcher.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module';
import { ChatGroupModule } from '../chatGroup/chatGroup.module';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ModelGatewayModule } from '../modelGateway/model-gateway.module';
import { UploadModule } from '../upload/upload.module';
import { FileAssetModule } from '../fileAsset/fileAsset.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatLiveSyncModule } from '../chatRealtime/chat-live-sync.module';
import { ConversationTurnQueue } from './conversation-turn-queue.service';
import { WsAuthValidator } from './guards/ws-auth.guard';
import { WorkflowProcessManager } from './workflowManager.service';

/**
 * 会话内核模块：一种会话、一条 Agent 循环、一个用户沙箱。
 * 计费只经 ChatBillingService → BILLING_PORT，敏感词只经 CONTENT_FILTER_PORT；
 * UserService / ChatLogService / ModelsService / RedisCacheService 均来自各自的全局模块。
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatLogEntity]),
    AgentModule,
    ChatGroupModule,
    ModelGatewayModule,
    UploadModule,
    FileAssetModule,
    ChatLiveSyncModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatTitleService,
    ChatControlService,
    ChatUploadContextService,
    ChatContextBuilderService,
    ChatBillingService,
    ChatPreflightService,
    ChatSubmissionService,
    ChatTurnPersistenceService,
    ChatInteractionRunner,
    InteractionDispatcher,
    ChatService,
    ChatGateway,
    ConversationTurnQueue,
    WsAuthValidator,
    WorkflowProcessManager,
  ],
  exports: [ChatService, ChatLiveSyncModule],
})
export class ChatModule {}
