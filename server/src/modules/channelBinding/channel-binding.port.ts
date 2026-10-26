/**
 * 渠道绑定端口（内核侧）
 *
 * 用户画像等内核能力只通过这个窄接口读取用户在外部渠道（微信 Bot 等）的绑定情况，
 * 不依赖任何实现的实体或服务。实现以 CHANNEL_BINDING_IMPLEMENTATION 令牌注册；
 * ChannelBindingModule 在包启用时把它挂到 CHANNEL_BINDING_PORT，否则使用 NoChannelBindings。
 */
export const CHANNEL_BINDING_PORT = 'CHANNEL_BINDING_PORT';
export const CHANNEL_BINDING_IMPLEMENTATION = 'CHANNEL_BINDING_IMPLEMENTATION';

export interface ChannelBindingRecord {
  id: number;
  channel: string;
  status: number;
  channelUserId?: string | null;
  boundAt?: Date | null;
  updatedAt?: Date | null;
}

export interface ChannelBindingPort {
  /** 某个用户的全部渠道绑定；没有渠道包时返回空列表。 */
  listUserBindings(userId: number): Promise<ChannelBindingRecord[]>;
  /** 把渠道侧用户 id 解析为站点用户（仅已生效的绑定）；未实现或没有绑定时返回 null。 */
  findUserByChannelUser?(
    channel: string,
    channelUserId: string,
  ): Promise<{ userId: number; status: number } | null>;
}

/* 无渠道实现：永远没有绑定 */
export class NoChannelBindings implements ChannelBindingPort {
  async listUserBindings(): Promise<ChannelBindingRecord[]> {
    return [];
  }
}
