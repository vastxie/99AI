import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ConfigEntity } from './config.entity';
import { GlobalConfigController } from './globalConfig.controller';
import { GlobalConfigService } from './globalConfig.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ConfigEntity, ChatLogEntity])],
  providers: [GlobalConfigService],
  controllers: [GlobalConfigController],
  exports: [GlobalConfigService],
})
export class GlobalConfigModule {}
