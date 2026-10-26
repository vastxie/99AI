import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigEntity } from './config.entity';
import { GlobalConfigRegistry } from './global-config.registry';
import { GlobalConfigController } from './globalConfig.controller';
import { GlobalConfigService } from './globalConfig.service';
import { GLOBAL_CONFIG_SERVICE } from './globalConfig.tokens';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ConfigEntity])],
  providers: [
    GlobalConfigRegistry,
    GlobalConfigService,
    {
      provide: GLOBAL_CONFIG_SERVICE,
      useExisting: GlobalConfigService,
    },
  ],
  controllers: [GlobalConfigController],
  exports: [GlobalConfigRegistry, GlobalConfigService, GLOBAL_CONFIG_SERVICE],
})
export class GlobalConfigModule {}
