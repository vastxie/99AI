import { Global, Module } from '@nestjs/common';
import { ChatGroupController } from './chatGroup.controller';
import { ChatGroupService } from './chatGroup.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from './chatGroup.entity';
import { AppEntity } from '../app/app.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChatGroupEntity, AppEntity])],
  controllers: [ChatGroupController],
  providers: [ChatGroupService],
  exports: [ChatGroupService],
})
export class ChatGroupModule {}
