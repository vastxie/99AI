import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { UserEntity } from '../user/user.entity';
import { VerificationService } from '../verification/verification.service';
import { VerifycationEntity } from '../verification/verifycation.entity';
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
      BalanceEntity,
      UserBalanceEntity,
      VerifycationEntity,
      AccountLogEntity,
      ConfigEntity,
      CramiPackageEntity,
      UserEntity,
      FingerprintLogEntity,
      ChatLogEntity,
      ChatGroupEntity,
    ]),
  ],
  controllers: [UserBalanceController],
  providers: [UserBalanceService, VerificationService, RedisCacheService],
  exports: [UserBalanceService],
})
export class UserBalanceModule {}
