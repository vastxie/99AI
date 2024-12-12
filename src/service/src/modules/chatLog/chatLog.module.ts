import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { UserEntity } from '../user/user.entity';
import { ChatLogController } from './chatLog.controller';
import { ChatLogEntity } from './chatLog.entity';
import { ChatLogService } from './chatLog.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatLogEntity, UserEntity, ChatGroupEntity]),
  ],
  controllers: [ChatLogController],
  providers: [ChatLogService],
  exports: [ChatLogService],
})
export class ChatLogModule {}
