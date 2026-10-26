import { Module } from '@nestjs/common';
import { PayPalService } from './paypal.service';
import { GlobalConfigModule } from '@/modules/globalConfig/globalConfig.module';

@Module({
  imports: [GlobalConfigModule],
  providers: [PayPalService],
  exports: [PayPalService],
})
export class PayPalModule {}
