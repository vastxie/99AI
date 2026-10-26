import { Global, Module } from '@nestjs/common';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { PaymentCallbackService } from './payment-callback.service';
import { PaymentPollingService } from './payment-polling.service';
import { PaymentReconcileService } from './payment-reconcile.service';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigService } from './payment-config.service';
import { OrderEntity } from '../order/order.entity';
import { PackageEntity } from '../package/package.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayPalModule } from './paypal/paypal.module';
import { StripeModule } from './stripe/stripe.module';
import { AlipayModule } from './alipay/alipay.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, PackageEntity]),
    PayPalModule,
    StripeModule,
    AlipayModule,
  ],
  controllers: [PayController, PaymentConfigController],
  providers: [
    PayService,
    PaymentCallbackService,
    PaymentPollingService,
    PaymentReconcileService,
    PaymentConfigService,
  ],
  exports: [PayService, PaymentCallbackService, PaymentPollingService, PaymentConfigService],
})
export class PayModule {}
