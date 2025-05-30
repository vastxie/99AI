import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoReplyController } from './autoReply.controller';
import { AutoReplyEntity } from './autoReply.entity';
import { AutoReplyService } from './autoReply.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AutoReplyEntity])],
  controllers: [AutoReplyController],
  providers: [AutoReplyService],
  exports: [AutoReplyService],
})
export class AutoReplyModule {}
