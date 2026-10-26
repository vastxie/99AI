import { PackageEntity } from '../package/package.entity';
import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderEntity } from './order.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBalanceEntity } from '../userBalance/userBalance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, PackageEntity, UserBalanceEntity])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
