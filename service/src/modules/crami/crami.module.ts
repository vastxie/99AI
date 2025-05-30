import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from '../chatGroup/chatGroup.entity';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { UserEntity } from '../user/user.entity';
import { AccountLogEntity } from '../userBalance/accountLog.entity';
import { BalanceEntity } from '../userBalance/balance.entity';
import { FingerprintLogEntity } from '../userBalance/fingerprint.entity';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { CramiController } from './crami.controller';
import { CramiEntity } from './crami.entity';
import { CramiService } from './crami.service';
import { CramiPackageEntity } from './cramiPackage.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CramiEntity,
      CramiPackageEntity,
      UserEntity,
      BalanceEntity,
      AccountLogEntity,
      ConfigEntity,
      UserBalanceEntity,
      FingerprintLogEntity,
      ChatLogEntity,
      ChatGroupEntity,
    ]),
  ],
  providers: [CramiService, UserBalanceService],
  controllers: [CramiController],
  exports: [CramiService],
})
export class CramiModule {}
