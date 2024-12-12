import { Global, Module } from '@nestjs/common';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { OrderEntity } from '../order/order.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, CramiPackageEntity])],
  controllers: [PayController],
  providers: [PayService],
  exports: [PayService],
})
export class PayModule {}
