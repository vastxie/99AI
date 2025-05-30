import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginController } from './plugin.controller';
import { PluginEntity } from './plugin.entity';
import { PluginService } from './plugin.service';

@Module({
  imports: [TypeOrmModule.forFeature([PluginEntity])],
  controllers: [PluginController],
  providers: [PluginService],
})
export class PluginModule {}
