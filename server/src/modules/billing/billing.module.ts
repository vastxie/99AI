import { Global, Logger, Module } from '@nestjs/common';
import {
  BILLING_IMPLEMENTATION,
  BILLING_PORT,
  BillingPort,
  NoopBillingService,
} from './billing.port';

/**
 * 全局提供 BILLING_PORT：
 * - 商业包装载并注册了实现（BILLING_IMPLEMENTATION）→ 直接使用；
 * - 否则 → NoopBillingService（内核在没有计费实现时仍可完整运行）。
 * 内核不引用任何商业包代码；是否装载商业包只由组合根 app.module.ts 决定。
 */
@Global()
@Module({
  providers: [
    {
      provide: BILLING_PORT,
      inject: [{ token: BILLING_IMPLEMENTATION, optional: true }],
      useFactory: (implementation?: BillingPort): BillingPort => {
        if (implementation) {
          return implementation;
        }
        Logger.log('计费实现未启用，内核使用 NoopBillingService', 'BillingModule');
        return new NoopBillingService();
      },
    },
  ],
  exports: [BILLING_PORT],
})
export class BillingModule {}
