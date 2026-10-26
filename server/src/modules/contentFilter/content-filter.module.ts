import { Global, Logger, Module } from '@nestjs/common';
import {
  CONTENT_FILTER_IMPLEMENTATION,
  CONTENT_FILTER_PORT,
  ContentFilterPort,
  PassthroughContentFilter,
} from './content-filter.port';

/**
 * 全局提供 CONTENT_FILTER_PORT：
 * - 内容安全包启用且实现已注册（CONTENT_FILTER_IMPLEMENTATION）→ 使用该实现；
 * - 否则 → PassthroughContentFilter（内核在没有内容审核能力时仍可完整运行）。
 */
@Global()
@Module({
  providers: [
    {
      provide: CONTENT_FILTER_PORT,
      inject: [{ token: CONTENT_FILTER_IMPLEMENTATION, optional: true }],
      useFactory: (implementation?: ContentFilterPort): ContentFilterPort => {
        if (implementation) {
          return implementation;
        }
        Logger.log('内容安全实现未启用，内核使用 PassthroughContentFilter', 'ContentFilterModule');
        return new PassthroughContentFilter();
      },
    },
  ],
  exports: [CONTENT_FILTER_PORT],
})
export class ContentFilterModule {}
