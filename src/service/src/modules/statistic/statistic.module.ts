import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatLogEntity } from '../chatLog/chatLog.entity';
import { ConfigEntity } from '../globalConfig/config.entity';
import { OrderEntity } from '../order/order.entity';
import { UserEntity } from '../user/user.entity';
import { StatisticController } from './statistic.controller';
import { StatisticService } from './statistic.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ChatLogEntity,
      ConfigEntity,
      OrderEntity,
    ]),
  ],
  controllers: [StatisticController],
  providers: [StatisticService],
})
export class StatisticModule {}
