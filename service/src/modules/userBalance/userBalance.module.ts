import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppEntity } from '../app/app.entity';
import { AppService } from '../app/app.service';
import { AppCatsEntity } from '../app/appCats.entity';
import { UserAppsEntity } from '../app/userApps.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { GlobalConfigModule } from '../globalConfig/globalConfig.module';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import { VerificationEntity } from '../verification/verification.entity';
import { VerificationService } from '../verification/verification.service';
import { AccountLogEntity } from './accountLog.entity';
import { BalanceEntity } from './balance.entity';
import { FingerprintLogEntity } from './fingerprint.entity';
import { UserBalanceController } from './userBalance.controller';
import { UserBalanceEntity } from './userBalance.entity';
import { UserBalanceService } from './userBalance.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppCatsEntity,
      AppEntity,
      UserAppsEntity,
      AccountLogEntity,
      BalanceEntity,
      UserBalanceEntity,
      CramiPackageEntity,
      ConfigEntity,
      ChatGroupEntity,
      ChatLogEntity,
      UserEntity,
      VerificationEntity,
      FingerprintLogEntity,
    ]),
    GlobalConfigModule,
  ],
  controllers: [UserBalanceController],
  providers: [UserBalanceService, VerificationService, RedisCacheService, AppService],
  exports: [UserBalanceService, AppService, TypeOrmModule],
})
export class UserBalanceModule {}
