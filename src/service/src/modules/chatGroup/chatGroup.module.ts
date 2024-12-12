import { Global, Module } from '@nestjs/common';
import { ChatGroupController } from './chatGroup.controller';
import { ChatGroupService } from './chatGroup.service';
import { Type } from 'class-transformer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from './chatGroup.entity';
import { AppEntity } from '../app/app.entity';
import { ModelsEntity } from '../models/models.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChatGroupEntity, AppEntity])],
  controllers: [ChatGroupController],
  providers: [ChatGroupService],
  exports: [ChatGroupService]
})
export class ChatGroupModule {}
