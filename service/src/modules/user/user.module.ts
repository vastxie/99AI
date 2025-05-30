import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppEntity } from '../app/app.entity';
import { AppCatsEntity } from '../app/appCats.entity';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { MailerService } from '../mailer/mailer.service';
import { RedisCacheService } from '../redisCache/redisCache.service';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { VerificationEntity } from './../verification/verification.entity';
import { VerificationService } from './../verification/verification.service';
import { UserController } from './user.controller';
import { UserEntity } from './user.entity';
import { UserService } from './user.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      VerificationEntity,
      BalanceEntity,
      AccountLogEntity,
      ConfigEntity,
      CramiPackageEntity,
      UserBalanceEntity,
      FingerprintLogEntity,
      ChatLogEntity,
      ChatGroupEntity,
      AppEntity,
      AppCatsEntity,
    ]),
  ],
  controllers: [UserController],
  providers: [
    UserService,
    VerificationService,
    UserBalanceService,
    RedisCacheService,
    MailerService,
  ],
  exports: [UserService],
})
export class UserModule {}
