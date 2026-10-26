import { Module } from '@nestjs/common';
import { AlipayService } from './alipay.service';
import { GlobalConfigModule } from '@/modules/globalConfig/globalConfig.module';

@Module({
  imports: [GlobalConfigModule],
  providers: [AlipayService],
  exports: [AlipayService],
})
export class AlipayModule {}
