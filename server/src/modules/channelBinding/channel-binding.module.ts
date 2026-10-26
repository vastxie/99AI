import { Global, Logger, Module } from '@nestjs/common';
import {
  CHANNEL_BINDING_IMPLEMENTATION,
  CHANNEL_BINDING_PORT,
  ChannelBindingPort,
  NoChannelBindings,
} from './channel-binding.port';

/**
 * 全局提供 CHANNEL_BINDING_PORT：
 * - 有实现注册（CHANNEL_BINDING_IMPLEMENTATION）→ 使用该实现；
 * - 否则 → NoChannelBindings（内核在没有外部渠道时仍可完整运行）。
 */
@Global()
@Module({
  providers: [
    {
      provide: CHANNEL_BINDING_PORT,
      inject: [{ token: CHANNEL_BINDING_IMPLEMENTATION, optional: true }],
      useFactory: (implementation?: ChannelBindingPort): ChannelBindingPort => {
        if (implementation) {
          return implementation;
        }
        Logger.log('渠道包未启用，内核使用 NoChannelBindings', 'ChannelBindingModule');
        return new NoChannelBindings();
      },
    },
  ],
  exports: [CHANNEL_BINDING_PORT],
})
export class ChannelBindingModule {}
