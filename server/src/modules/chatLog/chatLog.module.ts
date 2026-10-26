import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupModule } from '../chatGroup/chatGroup.module';
import { ChatLogController } from './chatLog.controller';
import { ChatLogEntity } from './chatLog.entity';
import { ChatLogService } from './chatLog.service';
import { ContextCheckpointModule } from '../contextCheckpoint/context-checkpoint.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChatLogEntity]), ChatGroupModule, ContextCheckpointModule],
  controllers: [ChatLogController],
  providers: [ChatLogService],
  exports: [ChatLogService],
})
export class ChatLogModule {}
