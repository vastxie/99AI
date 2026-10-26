import { SandboxModule } from '../sandbox/sandbox.module';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/user.entity';
import { ChatLiveSyncModule } from '../chatRealtime/chat-live-sync.module';
import { ChatGroupController } from './chatGroup.controller';
import { ChatGroupEntity } from './chatGroup.entity';
import { ChatGroupService } from './chatGroup.service';
import { ContextCheckpointModule } from '../contextCheckpoint/context-checkpoint.module';

@Global()
@Module({
  imports: [
    SandboxModule,
    TypeOrmModule.forFeature([ChatGroupEntity, UserEntity]),
    ChatLiveSyncModule,
    ContextCheckpointModule,
  ],
  controllers: [ChatGroupController],
  providers: [ChatGroupService],
  exports: [ChatGroupService],
})
export class ChatGroupModule {}
