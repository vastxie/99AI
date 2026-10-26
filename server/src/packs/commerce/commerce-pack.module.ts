import { Module } from '@nestjs/common';
import { CommerceConfigSection } from './commerce-config.section';
import { OrderModule } from './order/order.module';
import { PackageModule } from './package/package.module';
import { PayModule } from './pay/pay.module';
import { SigninModule } from './signin/signin.module';
import { TaskModule } from './task/task.module';
import { UserBalanceModule } from './userBalance/userBalance.module';

/**
 * 商业包：积分 / 套餐 / 订单 / 支付 / 签到 / 商业定时任务。
 *
 * 内核只通过 BillingPort（modules/billing）与这些能力交互；
 * COMMERCE_PACK_ENABLED=false（见 pack.json）时整包不装载，内核以 Noop 计费运行。
 */
@Module({
  imports: [UserBalanceModule, PackageModule, OrderModule, PayModule, SigninModule, TaskModule],
  providers: [CommerceConfigSection],
})
export class CommercePackModule {}
